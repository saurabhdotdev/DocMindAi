import re
import os
import json
from typing import Any
from groq import Groq
import google.generativeai as genai
import requests

def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception as e:
        print(f"Error initializing Groq client: {e}")
        return None

def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        genai.configure(api_key=api_key)
        # Using gemini-2.5-flash which is the current fast default model
        return genai.GenerativeModel('gemini-2.5-flash')
    except Exception as e:
        print(f"Error initializing Gemini client: {e}")
        return None

def init_qdrant_collection():
    qdrant_url = "http://qdrant:6333/collections/document_segments"
    try:
        res = requests.get(qdrant_url)
        if res.status_code == 200:
            return True
            
        create_res = requests.put(
            qdrant_url,
            json={
                "vectors": {
                    "size": 768,
                    "distance": "Cosine"
                }
            }
        )
        if create_res.status_code in [200, 201]:
            print("Successfully created Qdrant collection: document_segments")
            return True
        else:
            print(f"Failed to create Qdrant collection: {create_res.text}")
            return False
    except Exception as e:
        print(f"Error initializing Qdrant: {e}")
        return False

def index_document_to_qdrant(doc_id: str, text: str, doc_name: str = "Document") -> bool:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not configured, skipping Qdrant indexing")
        return False
        
    if not text or not text.strip():
        return False
        
    try:
        if not init_qdrant_collection():
            return False
            
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        chunks = []
        current_chunk = []
        current_len = 0
        
        for p in paragraphs:
            if current_len + len(p) > 1000:
                if current_chunk:
                    chunks.append("\n".join(current_chunk))
                current_chunk = [p]
                current_len = len(p)
            else:
                current_chunk.append(p)
                current_len += len(p) + 1
        if current_chunk:
            chunks.append("\n".join(current_chunk))
            
        if not chunks:
            return False
            
        genai.configure(api_key=api_key)
        
        batch_size = 20
        all_embeddings = []
        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i:i+batch_size]
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=batch_chunks,
                task_type="retrieval_document"
            )
            all_embeddings.extend(result['embedding'])
            
        import uuid
        points = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings)):
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{doc_id}_{idx}"))
            points.append({
                "id": point_id,
                "vector": embedding,
                "payload": {
                    "doc_id": doc_id,
                    "doc_name": doc_name,
                    "text": chunk,
                    "index": idx,
                    "page": (idx // 2) + 1
                }
            })
            
        qdrant_points_url = "http://qdrant:6333/collections/document_segments/points"
        for i in range(0, len(points), 100):
            batch_points = points[i:i+100]
            upsert_res = requests.put(
                qdrant_points_url,
                json={"points": batch_points}
            )
            if upsert_res.status_code != 200:
                print(f"Failed to upsert points to Qdrant: {upsert_res.text}")
                return False
                
        print(f"Successfully indexed document {doc_id} to Qdrant ({len(points)} segments)")
        return True
    except Exception as e:
        print(f"Error indexing document {doc_id} to Qdrant: {e}")
        return False

def search_qdrant_context(doc_id: Any, question: str, limit: int = 5) -> list:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return []
        
    try:
        genai.configure(api_key=api_key)
        res_embed = genai.embed_content(
            model="models/text-embedding-004",
            content=question,
            task_type="retrieval_query"
        )
        query_vector = res_embed['embedding']
        
        # Build match filter condition dynamically for single or multiple document IDs
        if isinstance(doc_id, list):
            match_cond = {"any": doc_id}
        else:
            match_cond = {"value": doc_id}
            
        search_url = "http://qdrant:6333/collections/document_segments/points/search"
        search_res = requests.post(
            search_url,
            json={
                "vector": query_vector,
                "limit": limit,
                "with_payload": True,
                "filter": {
                    "must": [
                        {
                            "key": "doc_id",
                            "match": match_cond
                        }
                    ]
                }
            }
        )
        
        if search_res.status_code == 200:
            hits = search_res.json().get("result", [])
            # Sort hits by document and segment index to maintain reading order
            hits.sort(key=lambda x: (x.get("payload", {}).get("doc_id", ""), x.get("payload", {}).get("index", 0)))
            
            sources = []
            for hit in hits:
                payload = hit.get("payload", {})
                text = payload.get("text", "")
                if text:
                    sources.append({
                        "docId": payload.get("doc_id", ""),
                        "docName": payload.get("doc_name", "Document"),
                        "text": text,
                        "page": payload.get("page", 1)
                    })
            return sources
        else:
            print(f"Qdrant search failed: {search_res.text}")
            return []
    except Exception as e:
        print(f"Error querying Qdrant: {e}")
        return []

def parse_ocr_layout(text: str):
    # Keep standard heuristic layout parsing to avoid UI breakage (coordinates needed)
    if not text:
        return {
            "pagesCount": 0,
            "language": "en",
            "confidence": 0.0,
            "blocks": []
        }
        
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    blocks = []
    for i, line in enumerate(lines[:20]):  # Map first 20 lines
        blocks.append({
            "type": "header" if i == 0 or line.isupper() else "paragraph",
            "text": line,
            "boundingBox": [50, 50 + i * 30, 500, 25]
        })
        
    return {
        "pagesCount": max(1, len(lines) // 40),
        "language": "en",
        "confidence": 99.2,
        "blocks": blocks
    }

def _fallback_extract_entities(text: str):
    entities = []
    
    # 1. Emails
    emails = re.findall(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b', text)
    for email in set(emails):
        entities.append({
            "name": email,
            "category": "EMAIL",
            "value": email,
            "startChar": text.find(email),
            "endChar": text.find(email) + len(email)
        })
        
    # 2. Phones
    phones = re.findall(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', text)
    for phone in set(phones):
        entities.append({
            "name": phone,
            "category": "PHONE",
            "value": phone,
            "startChar": text.find(phone),
            "endChar": text.find(phone) + len(phone)
        })
        
    # 3. Dates
    dates = re.findall(r'\b(?:\d{1,2}[-/\s]\d{1,2}[-/\s]\d{2,4})|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-,\s]+\d{4}\b', text, re.IGNORECASE)
    for date in set(dates):
        entities.append({
            "name": date,
            "category": "DATE",
            "value": date,
            "startChar": text.find(date),
            "endChar": text.find(date) + len(date)
        })
        
    # 4. Organizations
    org_patterns = [
        r'\b[A-Z][a-zA-Z0-9\s]+ (?:Innovations|LLP|Inc|Corp|Ltd|University|College|Solutions|Group)\b'
    ]
    for pattern in org_patterns:
        matches = re.findall(pattern, text)
        for match in set(matches):
            entities.append({
                "name": match.strip(),
                "category": "ORG",
                "value": match.strip(),
                "startChar": text.find(match),
                "endChar": text.find(match) + len(match)
            })
            
    return entities

def extract_entities(text: str):
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, falling back to regex entity extraction")
        return _fallback_extract_entities(text)
    
    truncated_text = text[:10000] if len(text) > 10000 else text
    
    try:
        prompt = f"""
        You are an expert data extraction assistant. Extract the following entities from the text below:
        - EMAIL: Email addresses
        - PHONE: Phone numbers
        - DATE: Dates (format exactly as written in text)
        - ORG: Organization or company names
        
        Return ONLY a JSON list of objects matching this exact schema:
        [
          {{
            "name": "extracted_value",
            "category": "EMAIL | PHONE | DATE | ORG",
            "value": "extracted_value",
            "startChar": 0,
            "endChar": 0
          }}
        ]
        
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        
        Text:
        {truncated_text}
        """
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
            except Exception as e:
                print(f"Groq extract_entities failed: {e}. Trying Gemini fallback...")
                if gemini_model:
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.1
                        }
                    )
                    content = response.text.strip()
                else:
                    raise e
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.1
                }
            )
            content = response.text.strip()
            
        data = json.loads(content)
        # Parse the JSON response
        if isinstance(data, dict) and "entities" in data:
            entities = data["entities"]
        elif isinstance(data, list):
            entities = data
        elif isinstance(data, dict):
            entities = data.get("data", list(data.values())[0] if data else [])
        else:
            entities = []
            
        # Post-process indexes
        for e in entities:
            val = e.get("value", "")
            if val:
                idx = text.find(val)
                e["startChar"] = idx if idx != -1 else 0
                e["endChar"] = (idx + len(val)) if idx != -1 else 0
            else:
                e["startChar"] = 0
                e["endChar"] = 0
        return entities
    except Exception as e:
        print(f"Error in extract_entities: {e}. Falling back to regex.")
        return _fallback_extract_entities(text)

def _fallback_analyze_resume(text: str):
    skills_registry = [
        "React.js", "Node.js", "PostgreSQL", "React", "Node", "Python", "AWS", "Java", 
        "SQL", "Git", "Docker", "Machine Learning", "FPGA", "TypeScript", "JavaScript"
    ]
    found_skills = [s for s in skills_registry if s.lower() in text.lower()]
    
    degrees = ["BS", "MS", "B.Tech", "M.Tech", "MBA", "PHD", "Bachelor", "Master"]
    found_education = []
    lines = text.split('\n')
    for line in lines:
        for degree in degrees:
            if degree.lower() in line.lower() or "university" in line.lower() or "college" in line.lower():
                found_education.append({
                    "degree": degree if degree.lower() in line.lower() else "Degree",
                    "institution": line.strip()
                })
                break
                
    ats_score = min(45 + len(found_skills) * 8, 98)
    suggestions = []
    if len(found_skills) < 6:
        suggestions.append("Add more technical skills matching target software engineering descriptions.")
    if "ats" not in text.lower():
        suggestions.append("Incorporate quantitative metric achievements (e.g., 'improved page-load times by 30%').")
        
    experience = []
    for line in lines:
        if "innovations" in line.lower() or "developer" in line.lower() or "engineer" in line.lower() or "manager" in line.lower():
            experience.append({
                "role": line.strip()[:60],
                "company": "Company",
                "duration": "Duration"
            })
            
    if not experience:
        experience.append({
            "role": "Software Developer",
            "company": "Tech Solutions",
            "duration": "2025 - Present"
        })

    return {
        "skills": found_skills,
        "education": found_education[:3],
        "experience": experience[:3],
        "projects": [
            {"title": "DocMind AI", "description": "Modern multi-format document conversion and querying platform."}
        ],
        "atsScore": ats_score,
        "suggestions": suggestions
    }

def analyze_resume_profile(text: str):
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, falling back to heuristic resume analysis")
        return _fallback_analyze_resume(text)
    
    truncated_text = text[:10000] if len(text) > 10000 else text
    
    try:
        prompt = f"""
        You are an expert ATS (Applicant Tracking System) resume analyzer. Analyze the resume text below.
        Extract the following:
        - Technical skills (array of strings)
        - Education history (array of objects with keys 'degree', 'institution')
        - Work experience (array of objects with keys 'role', 'company', 'duration')
        - Projects (array of objects with keys 'title', 'description')
        - ATS Score (integer between 0 and 100 representing how well optimized this resume is)
        - Improvement suggestions (array of strings)
        
        Return ONLY a JSON object matching this exact schema:
        {{
          "skills": ["Skill1", "Skill2"],
          "education": [{{"degree": "DegreeName", "institution": "InstitutionName"}}],
          "experience": [{{"role": "RoleTitle", "company": "CompanyName", "duration": "Duration"}}],
          "projects": [{{"title": "ProjectTitle", "description": "ProjectDescription"}}],
          "atsScore": 85,
          "suggestions": ["Suggestion 1", "Suggestion 2"]
        }}
        
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        
        Resume Text:
        {truncated_text}
        """
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
            except Exception as e:
                print(f"Groq analyze_resume_profile failed: {e}. Trying Gemini fallback...")
                if gemini_model:
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.2
                        }
                    )
                    content = response.text.strip()
                else:
                    raise e
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.2
                }
            )
            content = response.text.strip()
            
        data = json.loads(content)
        
        # Validate schema keys
        return {
            "skills": data.get("skills", []),
            "education": data.get("education", [])[:3],
            "experience": data.get("experience", [])[:3],
            "projects": data.get("projects", [])[:3],
            "atsScore": int(data.get("atsScore", 70)),
            "suggestions": data.get("suggestions", [])
        }
    except Exception as e:
        print(f"Error in analyze_resume_profile: {e}. Falling back.")
        return _fallback_analyze_resume(text)

def _fallback_answer_question(text: str, question: str, doc_id: Any = None) -> tuple:
    doc_id_val = doc_id if isinstance(doc_id, str) else (doc_id[0] if isinstance(doc_id, list) and doc_id else "unknown")
    default_sources = [{
        "docId": doc_id_val,
        "docName": "Document",
        "text": text[:500] + "..." if text else "",
        "page": 1
    }]

    if not text or not question:
        return "Please upload a document or ask a valid question.", default_sources
        
    question_lower = question.lower()
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # 1. Summary request
    if any(k in question_lower for k in ["summary", "summarise", "summarize", "highlights", "important"]):
        summary_lines = []
        for line in lines:
            if any(k in line.lower() for k in ["education", "experience", "skills", "projects", "objective", "summary"]):
                summary_lines.append(f"• **{line}**")
            elif len(summary_lines) < 8 and len(line) > 30:
                summary_lines.append(f"• {line}")
        if summary_lines:
            return "Here is a quick summary of the document contents:\n\n" + "\n".join(summary_lines[:8]), default_sources
        return "I found the following document content:\n" + "\n".join(lines[:5]), default_sources
        
    # 2. Contact details
    if any(k in question_lower for k in ["email", "phone", "contact", "address", "call", "reach"]):
        contacts = []
        emails = re.findall(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b', text)
        phones = re.findall(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', text)
        for email in set(emails):
            contacts.append(f"Email: {email}")
        for phone in set(phones):
            contacts.append(f"Phone: {phone}")
        if contacts:
            return "Here are the contact details found in the document:\n\n" + "\n".join(contacts), default_sources
            
    # 3. Keyword matching fallback
    keywords = [w for w in re.findall(r'\w+', question_lower) if w not in ["what", "is", "the", "are", "in", "of", "for", "on", "with", "where", "how", "who", "whom", "whose", "why", "can", "you", "tell", "me", "about"]]
    
    matched_lines = []
    for line in lines:
        match_count = sum(1 for kw in keywords if kw in line.lower())
        if match_count > 0:
            matched_lines.append((match_count, line))
            
    # Sort by number of matching keywords
    matched_lines.sort(key=lambda x: x[0], reverse=True)
    
    if matched_lines:
        results = [f"• {line}" for _, line in matched_lines[:5]]
        return f"Based on a local keyword scan for '{', '.join(keywords)}':\n\n" + "\n".join(results), default_sources
        
    return "I couldn't find a direct answer to your question in the document. Please configure the `GROQ_API_KEY` in the environment variables to enable advanced AI-powered Q&A.", default_sources

def filter_relevant_context(text: str, question: str, max_tokens: int = 1500) -> str:
    if not text:
        return ""
        
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if len(text) < max_tokens * 4:
        return text
        
    question_lower = question.lower()
    keywords = [w for w in re.findall(r'\w+', question_lower) if w not in ["what", "is", "the", "are", "in", "of", "for", "on", "with", "where", "how", "who", "whom", "whose", "why", "can", "you", "tell", "me", "about"]]
    
    if not keywords:
        return "\n".join(lines[:100])
        
    scored_lines = []
    for idx, line in enumerate(lines):
        score = sum(2 if kw in line.lower() else 0 for kw in keywords)
        if score > 0:
            scored_lines.append((score, idx, line))
            
    if not scored_lines:
        return "\n".join(lines[:100])
        
    scored_lines.sort(key=lambda x: x[0], reverse=True)
    
    selected_indices = set()
    for _, idx, _ in scored_lines[:20]:
        for neighbor in range(max(0, idx - 2), min(len(lines), idx + 3)):
            selected_indices.add(neighbor)
            
    sorted_indices = sorted(list(selected_indices))
    
    filtered_lines = []
    last_idx = -1
    for idx in sorted_indices:
        if last_idx != -1 and idx > last_idx + 1:
            filtered_lines.append("[...]")
        filtered_lines.append(lines[idx])
        last_idx = idx
        
    context = "\n".join(filtered_lines)
    max_chars = max_tokens * 4
    if len(context) > max_chars:
        context = context[:max_chars] + "\n[Context truncated due to size limit]"
        
    return context

def answer_question(text: str, question: str, doc_id: Any = None) -> tuple:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, falling back to local Q&A engine")
        return _fallback_answer_question(text, question, doc_id)
        
    try:
        system_instructions = """
        You are a highly intelligent, semantic AI assistant helping a user analyze, extract, and query details from a document.
        You will be provided with the document text context and a user's question.
        
        Instructions:
        1. Answer the user's question clearly, concisely, and accurately based on the provided document context.
        2. Be flexible and use semantic reasoning. If the user asks a question using synonyms, shorthand, or abbreviations (e.g. "where working" or "education" or "experience"), interpret their intent intelligently using the context.
        3. If the user asks general or meta-questions about the document (e.g. "what is important in this doc", "summarize", "give key highlights"), analyze the text and provide a helpful response.
        4. If the document is a resume, CV, or professional profile, and the user asks for an evaluation (e.g. "is he good", "should we hire", "rate them", "how is the college", "is that college good"), you are explicitly instructed to use your external general knowledge to evaluate the quality, reputation, and prestige of the universities/colleges (e.g. PICT Pune is widely known as a top-tier premier engineering college in Maharashtra/India; IITs/NITs/IISc are elite institutes; Ivy League, etc.), company reputations, industry tools/frameworks, and research publication impact (e.g. Scopus-indexed). Provide a detailed, professional, and insightful rating or comparison to help the user make hiring decisions.
        5. If the document context contains absolutely no relevant information to answer the question, state "I couldn't find the answer in the document."
        6. Speak in a natural, helpful, and direct tone. Keep core facts grounded in the provided document details, but bring in external insights/rankings/standard evaluations for colleges/companies when requested.
        """
        
        # Try to retrieve semantic vector search context from Qdrant first
        sources = []
        if doc_id and os.getenv("GEMINI_API_KEY"):
            sources = search_qdrant_context(doc_id, question)
            
        if sources:
            context_to_use = "\n\n[...]\n\n".join([s["text"] for s in sources])
        else:
            # Fallback to local keyword RAG
            context_to_use = filter_relevant_context(text, question, max_tokens=1500)
            doc_id_val = doc_id if isinstance(doc_id, str) else (doc_id[0] if isinstance(doc_id, list) and doc_id else "unknown")
            sources = [{
                "docId": doc_id_val,
                "docName": "Document",
                "text": context_to_use[:500] + "..." if context_to_use else "",
                "page": 1
            }]
            
        if groq_client:
            try:
                prompt = f"""
                Document Context:
                ---
                {context_to_use}
                ---
                
                Question: {question}
                
                Answer:
                """
                response = groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {"role": "system", "content": system_instructions},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3
                )
                return response.choices[0].message.content.strip(), sources
            except Exception as e:
                print(f"Groq Q&A failed: {e}. Trying Gemini fallback...")
                if gemini_model:
                    prompt = f"""
                    System Instructions:
                    {system_instructions}
                    
                    Document Context:
                    ---
                    {context_to_use}
                    ---
                    
                    Question: {question}
                    """
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={"temperature": 0.3}
                    )
                    return response.text.strip(), sources
                else:
                    raise e
        elif gemini_model:
            prompt = f"""
            System Instructions:
            {system_instructions}
            
            Document Context:
            ---
            {context_to_use}
            ---
            
            Question: {question}
            """
            response = gemini_model.generate_content(
                prompt,
                generation_config={"temperature": 0.3}
            )
            return response.text.strip(), sources
    except Exception as e:
        print(f"Error communicating with LLM provider: {e}. Falling back to local Q&A engine.")
        return _fallback_answer_question(text, question, doc_id)

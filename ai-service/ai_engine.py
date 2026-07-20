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
                    model="llama-3.3-70b-versatile",
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

def rewrite_query_with_history(history: list, question: str) -> str:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    if not gemini_model and not groq_client:
        return question

    history_str = ""
    for turn in history[-5:]:  # Last 5 turns for efficiency
        role = "User" if turn.get("role") == "user" else "Assistant"
        content = turn.get("content", "")
        history_str += f"{role}: {content}\n"

    prompt = f"""
    Given the following conversation history and a follow-up question, rewrite the follow-up question to be a standalone search query that can be used for semantic document search.
    Do NOT answer the question. Just return the rewritten question itself.
    If the question is already a standalone question or does not need rewriting, return it exactly as-is.

    Conversation History:
    {history_str}

    Follow-up Question: {question}

    Standalone Search Query:
    """

    try:
        if groq_client:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a precise query rewriter. Return only the rewritten standalone question, nothing else."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            rewritten = response.choices[0].message.content.strip()
            print(f"Rewritten query (Groq): '{question}' -> '{rewritten}'")
            return rewritten
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={"temperature": 0.1}
            )
            rewritten = response.text.strip()
            print(f"Rewritten query (Gemini): '{question}' -> '{rewritten}'")
            return rewritten
    except Exception as e:
        print(f"Error rewriting query: {e}. Using original question.")

    return question

def answer_question(text: str, question: str, doc_id: Any = None, custom_system_prompt: str = None, history: list = None) -> tuple:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, falling back to local Q&A engine")
        return _fallback_answer_question(text, question, doc_id)
        
    try:
        system_instructions = custom_system_prompt if custom_system_prompt else """
        You are a highly intelligent, semantic AI assistant helping a user analyze, extract, and query details from a document.
        You will be provided with the document text context, recent conversation history, and a user's latest question.
        
        Instructions:
        1. Answer the user's question clearly, concisely, and accurately based on the provided document context.
        2. DYNAMIC FORMATTING RULE: Evaluate the user's query intent to determine the best visual structure:
           - Specific Factual/Estimate Queries: If the user is asking for a specific number, estimate, definition, or singular fact, output a direct, clean paragraph explanation. Append the page reference at the end of the text (e.g., "The estimate is 45% (Page 12)").
           - Pointwise/Collection/Comparison Queries: If the user asks to list multiple items, compare points, list details, or outlines collections (e.g., "what are these 5", "compare these resumes"), you MUST automatically format the answer in a structured Markdown Table (using standard pipe notation `| Header 1 | Header 2 |`) with clear headers, rather than a raw bulleted list.
           - Code Queries: If the user asks for code, programming snippets, or scripts, output it inside a markdown fenced code block with the language label (e.g. ```python).
        3. Be flexible and use semantic reasoning. If the user asks a question using synonyms, shorthand, or abbreviations (e.g. "where working" or "education" or "experience"), interpret their intent intelligently using the context.
        4. If the user asks general or meta-questions about the document (e.g. "what is important in this doc", "summarize", "give key highlights"), analyze the text and provide a helpful response.
        5. If the document is a resume, CV, or professional profile, and the user asks for an evaluation (e.g. "is he good", "should we hire", "rate them", "how is the college", "is that college good"), you are explicitly instructed to use your external general knowledge to evaluate the quality, reputation, and prestige of the universities/colleges (e.g. PICT Pune is widely known as a top-tier premier engineering college in Maharashtra/India; IITs/NITs/IISc are elite institutes; Ivy League, etc.), company reputations, industry tools/frameworks, and research publication impact (e.g. Scopus-indexed). Provide a detailed, professional, and insightful rating or comparison to help the user make hiring decisions.
        6. Ground your facts strictly in the document details. If the user asks a specific factual question about the document that cannot be answered, state what is/isn't there. However, if the user asks a conversational follow-up, general reasoning, or speculative question (e.g. "still what do you think", "what is your opinion", or asking to guess the target audience/exam/intent of the document), do NOT shut them down with a rigid fallback. Instead, analyze the document context, clearly note what is or isn't explicitly mentioned, and then provide a highly intelligent, logical deduction, explanation, or speculation using your general knowledge to be as helpful as possible.
        7. Speak in a natural, helpful, and direct tone. Maintain continuity with the recent conversation history provided.
        8. CITATIONS RULE: You MUST cite the specific sources from the context using inline superscript numbers, e.g., [1], [2], or [3] (corresponding to [Source 1], [Source 2], [Source 3]). Place these citations directly after the sentence, claim, or table cell content that references that source. Do not append a separate "Sources" section or summary list at the end of your response, just use the inline bracket numbers.
        """
        
        # Rewrite query if conversation history is available
        search_query = question
        if history and len(history) > 0:
            search_query = rewrite_query_with_history(history, question)
        
        # Try to retrieve semantic vector search context from Qdrant first
        sources = []
        if doc_id and os.getenv("GEMINI_API_KEY"):
            sources = search_qdrant_context(doc_id, search_query)
            
        if sources:
            context_to_use = ""
            for idx, s in enumerate(sources):
                context_to_use += f"[Source {idx + 1}] (Document: {s['docName']}, Page: {s['page']}):\n{s['text']}\n\n"
        else:
            # Fallback to local keyword RAG
            context_to_use_raw = filter_relevant_context(text, search_query, max_tokens=1500)
            context_to_use = f"[Source 1] (Document: Document, Page: 1):\n{context_to_use_raw}"
            doc_id_val = doc_id if isinstance(doc_id, str) else (doc_id[0] if isinstance(doc_id, list) and doc_id else "unknown")
            sources = [{
                "docId": doc_id_val,
                "docName": "Document",
                "text": context_to_use_raw[:500] + "..." if context_to_use_raw else "",
                "page": 1
            }]
            
        # Build history context string
        history_context = ""
        if history and len(history) > 0:
            history_context = "\nRecent Conversation History:\n"
            for turn in history[-5:]:  # Include last 5 turns
                role = "User" if turn.get("role") == "user" else "Assistant"
                content = turn.get("content", "")
                history_context += f"{role}: {content}\n"
            history_context += "\n"

        if groq_client:
            try:
                prompt = f"""
                Document Context:
                ---
                {context_to_use}
                ---
                {history_context}
                Question: {question}
                
                Answer:
                """
                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
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
                    {history_context}
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
            {history_context}
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

def translate_layout_blocks(blocks: list, target_lang: str) -> list:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not blocks:
        return []
        
    if not gemini_model and not groq_client:
        return blocks
        
    try:
        texts = [b.get("text", "") for b in blocks]
        
        prompt = f"""
        You are a professional layout-preserving translator. Translate the following list of text segments to {target_lang}.
        Ensure the exact list length is preserved and translated accurately, keeping formatting and tone intact.
        
        Return ONLY a JSON list of strings representing the translated segments matching this exact format:
        [
          "translated_segment_1",
          "translated_segment_2",
          ...
        ]
        
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        
        Segments:
        {json.dumps(texts)}
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
            except Exception:
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
                    raise
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.1
                }
            )
            content = response.text.strip()
            
        translated_texts = json.loads(content)
        if isinstance(translated_texts, dict):
            translated_texts = list(translated_texts.values())[0]
            
        translated_blocks = []
        for idx, block in enumerate(blocks):
            translated_text = translated_texts[idx] if idx < len(translated_texts) else block.get("text", "")
            translated_blocks.append({
                **block,
                "text": translated_text
            })
        return translated_blocks
    except Exception as e:
        print(f"Error in translate_layout_blocks: {e}")
        return blocks

def compare_documents(docs: list) -> list:
    comparison_results = []
    for d in docs:
        resume_analysis = d.get("resumeAnalysis") or {}
        classification = d.get("classification") or {}
        
        metrics = {
            "id": d.get("id"),
            "name": d.get("name"),
            "type": d.get("type"),
            "size": d.get("size"),
            "category": classification.get("label", "Unknown"),
            "confidence": classification.get("confidence", 0.0),
            "atsScore": resume_analysis.get("atsScore", 0),
            "skillsCount": len(resume_analysis.get("skills") or []),
            "educationCount": len(resume_analysis.get("education") or []),
            "experienceCount": len(resume_analysis.get("experience") or []),
            "suggestionsCount": len(resume_analysis.get("suggestions") or []),
            "entitiesCount": len(d.get("entities") or []),
        }
        comparison_results.append(metrics)
    return comparison_results

def download_file_from_s3(storage_key: str) -> str:
    import boto3
    s3_endpoint = os.environ.get("S3_ENDPOINT", "http://localstack:4566")
    bucket_name = os.environ.get("S3_BUCKET_NAME", "docmind-uploads")
    aws_key = os.environ.get("AWS_ACCESS_KEY_ID", "test")
    aws_secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "test")
    aws_region = os.environ.get("AWS_REGION", "us-east-1")
    
    s3 = boto3.client(
        "s3",
        endpoint_url=s3_endpoint,
        aws_access_key_id=aws_key,
        aws_secret_access_key=aws_secret,
        region_name=aws_region
    )
    
    local_path = os.path.join("/tmp", os.path.basename(storage_key))
    os.makedirs("/tmp", exist_ok=True)
    
    s3.download_file(bucket_name, storage_key, local_path)
    return local_path

def transcribe_multimedia(storage_key: str, doc_name: str) -> dict:
    local_path = None
    try:
        local_path = download_file_from_s3(storage_key)
        media_file = genai.upload_file(path=local_path)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = """
        You are a high-fidelity multimedia transcribing assistant.
        Transcribe the uploaded audio/video content completely.
        
        Provide the output as a valid JSON object strictly matching this format:
        {
          "text": "Full combined raw transcription text...",
          "blocks": [
            {
              "text": "Segment text...",
              "timestamp": "00:05",
              "seconds": 5,
              "boundingBox": [10, 10, 200, 20]
            },
            ...
          ]
        }
        
        For "boundingBox", assign simulated coordinates where segment i has boundingBox [10, 10 + i * 40, 400, 30] so they display cleanly inside the browser.
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        """
        
        response = model.generate_content(
            [media_file, prompt],
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.1
            }
        )
        
        try:
            genai.delete_file(media_file.name)
        except Exception as file_err:
            print(f"Failed to delete genai file: {file_err}")
            
        data = json.loads(response.text.strip())
        return {
            "success": True,
            "text": data.get("text", ""),
            "layout": {
                "pagesCount": 1,
                "blocks": data.get("blocks", [])
            }
        }
    except Exception as e:
        print(f"Error in transcribe_multimedia: {e}")
        # Fallback to a mock transcript if Gemini is not configured or fails
        return {
            "success": True,
            "text": f"Transcription fallback for {doc_name}. Gemini media API error: {e}",
            "layout": {
                "pagesCount": 1,
                "blocks": [
                    {
                        "text": f"This is a fallback transcription for {doc_name} because the multimodal API encountered an error or Gemini key was missing.",
                        "timestamp": "00:00",
                        "seconds": 0,
                        "boundingBox": [10, 50, 480, 30]
                    }
                ]
            }
        }
    finally:
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception as rm_err:
                print(f"Failed to remove temp file: {rm_err}")

def simulate_agent_debate(text: str, question: str, custom_agents: list = None) -> list:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if custom_agents and len(custom_agents) > 0:
        # Build dynamic prompt with custom agents
        agent_descriptions = ""
        for idx, a in enumerate(custom_agents):
            name = a.get("name", f"Agent {idx+1}")
            avatar = a.get("avatar", "🤖")
            prompt_instr = a.get("systemPrompt", "Be a helpful assistant.")
            agent_descriptions += f"{idx+1}. {name} (Avatar: {avatar}): {prompt_instr}\n"
            
        prompt = f"""
        You are a simulator of a panel discussion featuring the following custom agents:
        {agent_descriptions}
        
        They are discussing/debating the following document text and question:
        Document Context: {text[:4000]}
        Question/Topic: {question}
        
        Simulate a collaborative discussion panel.
        Instructions:
        1. Turn 1-N: Each agent gives their professional opinion based on their custom instructions. They should actively respond to, critique, or build upon the previous agent's points (e.g. "I hear Agent X's perspective, but from my view...").
        2. Final Turn: Add a "Panel Moderator (Consensus)" agent with avatar "🤖" at the end of the list. The message of the Moderator MUST contain a detailed Markdown Table summarizing the points discussed, each agent's key position, and a final consensus evaluation rating (e.g. 1-5 Stars). Place inline superscript citations (e.g. [1], [2]) directly inside the table cells right next to the facts discussed.
        
        Return ONLY a JSON object matching this exact format:
        {{
          "dialogue": [
            {{ "agent": "AgentName", "avatar": "Avatar", "message": "Message text..." }}
          ]
        }}
        
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        """
    else:
        # Fallback to system defaults (Leo, Sarah, Mike)
        prompt = f"""
        You are a simulator of three professional characters in a discussion panel:
        1. Leo (Tech Lead) (Avatar: 👨‍💻): Highly technical, critical of technology selections, focuses on complexity and programming skills.
        2. Sarah (HR Director) (Avatar: 👩‍💼): Focuses on team fit, training costs, candidate experience, human dynamics, work timelines.
        3. Mike (Business Analyst) (Avatar: 📊): Focuses on commercial viability, cost-efficiency, business return, project risks.
        
        They are debating the following document text and question:
        Document Context: {text[:4000]}
        Question/Topic: {question}
        
        Simulate an active debate panel discussion.
        Instructions:
        - Leo (Tech Lead) speaks first, analyzing technical parameters from the text.
        - Sarah (HR Director) speaks second, reacting directly to Leo's inputs and adding HR/people parameters.
        - Mike (Business Analyst) speaks third, reacting to both Leo and Sarah's points and adding business/cost parameters.
        - Panel Moderator (Consensus) (Avatar: 🤖) speaks last, reviewing their debate. The message of the Moderator MUST contain a beautiful structured Markdown Table summarizing:
          - Aspect Evaluated
          - Leo's View (Technical)
          - Sarah's View (HR)
          - Mike's View (Business)
          - Consensus Rating (e.g. 1-5 Stars)
          Ensure you place inline superscript citations (e.g. [1], [2]) directly inside the table cells next to the facts discussed.
          
        Return ONLY a JSON object matching this exact format:
        {{
          "dialogue": [
            {{ "agent": "Leo (Tech Lead)", "avatar": "👨‍💻", "message": "..." }},
            {{ "agent": "Sarah (HR Director)", "avatar": "👩‍💼", "message": "..." }},
            {{ "agent": "Mike (Business Analyst)", "avatar": "📊", "message": "..." }},
            {{ "agent": "Panel Moderator (Consensus)", "avatar": "🤖", "message": "..." }}
          ]
        }}
        
        Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
        """
    
    try:
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
            except Exception:
                if gemini_model:
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.3
                        }
                    )
                    content = response.text.strip()
                else:
                    raise
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3
                }
            )
            content = response.text.strip()
            
        data = json.loads(content)
        if isinstance(data, dict):
            # If the LLM returned a dictionary with a key like "debate" or "dialogue"
            data = list(data.values())[0]
        return data
    except Exception as e:
        print(f"Error in simulate_agent_debate: {e}")
        return [
            { "agent": "Leo (Tech Lead)", "message": f"I think this document details are solid. (Simulated fallback due to: {e})" },
            { "agent": "Sarah (HR Director)", "message": "I agree with Leo but we need to consider onboarding timelines." },
            { "agent": "Mike (Business Analyst)", "message": "Let's focus on the financial metrics and cost impact." }
        ]

def generate_podcast_summary(text: str) -> dict:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    prompt = f"""
    You are a scriptwriter for NPR's news tech podcast.
    Review the following document context:
    {text[:5000]}
    
    Write a news anchor dialogue between two hosts:
    - Host A (Alex): Enthusiastic, introduces the document, asks clarifying questions.
    - Host B (Brian): Expert, breaks down complex topics simply, provides insights.
    
    Return ONLY a JSON object strictly matching this format:
    {{
      "title": "NPR Tech Brief: Document Summary",
      "dialogue": [
        {{ "host": "Alex", "text": "Hello and welcome to today's news brief..." }},
        {{ "host": "Brian", "text": "Thanks, Alex. Today we are looking at..." }}
      ]
    }}
    
    Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
    """
    
    try:
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
            except Exception:
                if gemini_model:
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.3
                        }
                    )
                    content = response.text.strip()
                else:
                    raise
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3
                }
            )
            content = response.text.strip()
            
        return json.loads(content)
    except Exception as e:
        print(f"Error in generate_podcast_summary: {e}")
        return {
            "title": "NPR Brief: Fallback Summary",
            "dialogue": [
                { "host": "Alex", "text": "Hey Brian, have you had a chance to read the uploaded document?" },
                { "host": "Brian", "text": f"Yes Alex, it looks like a comprehensive file, but my system summary generator is running in fallback mode right now: {e}." }
            ]
        }

def optimize_agent_prompt(description: str) -> str:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, returning fallback simplified optimized prompt")
        return f"You are a specialized assistant whose persona is defined as follows: {description}. Provide helpful, structured, and accurate responses."
        
    prompt = f"""
    You are an expert Prompt Engineer and AI System Architect.
    The user wants to create a custom AI assistant/agent persona. 
    They have provided a brief description of the goal:
    "{description}"
    
    Your task is to write a highly optimized, professional, and detailed SYSTEM PROMPT for this AI agent.
    
    Instructions:
    1. Define the persona's role, background, and tone (e.g. professional, encouraging, clinical, formal).
    2. Outline specific capabilities and step-by-step reasoning steps the agent must take.
    3. Define strict constraints (what they should NOT do, how they should handle missing information).
    4. Specify formatting preferences (e.g., using bullet points, bold highlights, clear sections, or tables where appropriate).
    5. Write the final system prompt directly as the output. Do not include introductory text like "Here is your system prompt:" or markdown fences. Return ONLY the final system prompt instructions.
    
    Final System Prompt:
    """
    
    try:
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4
                )
                content = response.choices[0].message.content
            except Exception as e:
                print(f"Groq optimize prompt failed: {e}. Trying Gemini fallback...")
                if gemini_model:
                    response = gemini_model.generate_content(
                        prompt,
                        generation_config={"temperature": 0.4}
                    )
                    content = response.text.strip()
                else:
                    raise e
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={"temperature": 0.4}
            )
            content = response.text.strip()
            
        return content.strip()
    except Exception as e:
        print(f"Error in optimize_agent_prompt: {e}")
        return f"You are a specialized assistant whose persona is defined as follows: {description}. Provide helpful, structured, and accurate responses."

def extract_action_items(text: str) -> list:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        print("Neither Gemini nor Groq API Key found, returning fallback empty action items list")
        return []
        
    prompt = f"""
    You are a highly efficient administrative AI assistant.
    Analyze the provided document text context and extract all actionable items, tasks, commitments, or assignments.
    For each task, identify:
    1. Description/title of the action item.
    2. Assignee (person, team, or department responsible, if mentioned; otherwise "Unassigned").
    3. Due Date (deadline or timeline, if mentioned; otherwise "No deadline").
    
    Return ONLY a JSON list of objects matching this exact format:
    [
      {{
        "title": "Action item description",
        "assignee": "Name or Team",
        "dueDate": "Due date / timeline"
      }}
    ]
    
    Ensure you only return valid JSON. Do not write any markdown code blocks, explanations, or metadata.
    
    Document Text:
    {text[:12000]}
    """
    
    try:
        content = ""
        if groq_client:
            try:
                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
            except Exception as e:
                print(f"Groq extract_action_items failed: {e}. Trying Gemini fallback...")
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
            
        import json
        data = json.loads(content)
        if isinstance(data, dict):
            for val in data.values():
                if isinstance(val, list):
                    data = val
                    break
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print(f"Error in extract_action_items: {e}")
        return []

def generate_chat_title(question: str) -> str:
    gemini_model = get_gemini_client()
    groq_client = get_groq_client()
    
    if not gemini_model and not groq_client:
        return "New Conversation"
        
    prompt = f"""
    Analyze the following user's first question in a chat and generate a short, punchy, summary title for the conversation.
    The title must be between 3 and 5 words maximum. Do not put quotes around it, and do not prefix it. Just return the raw title.
    
    First Question: {question}
    
    Title:
    """
    
    try:
        if groq_client:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a precise conversation summarizer. Return only a 3-5 word title with no quotes or markdown, nothing else."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            title = response.choices[0].message.content.strip()
            print(f"Generated chat title (Groq): '{title}'")
            return title
        elif gemini_model:
            response = gemini_model.generate_content(
                prompt,
                generation_config={"temperature": 0.3}
            )
            title = response.text.strip()
            # Clean up potential leading/trailing quotes
            if title.startswith('"') and title.endswith('"'):
                title = title[1:-1]
            print(f"Generated chat title (Gemini): '{title}'")
            return title
    except Exception as e:
        print(f"Error generating chat title: {e}")
        
    return "New Chat Thread"

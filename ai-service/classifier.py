import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

class DocumentClassifier:
    def __init__(self):
        # 1. Training dataset definition
        self.train_data = [
            # Resumes
            ("SAURABH KULKARNI Pune, Maharashtra | Full-stack Software Developer React.js Node.js PostgreSQL EXPERIENCE Education Skills Projects profile resume curriculum vitae CV", "RESUME"),
            ("John Doe, Software Engineer. Education: BS Computer Science. Experience: developed web applications using Java, Python, and AWS. Skills: React, Node, SQL.", "RESUME"),
            ("Curriculum Vitae. Jane Smith. Email: jane@example.com. Professional Summary: Experienced Data Analyst with expertise in Python, SQL, Tableau, and Machine Learning.", "RESUME"),
            ("RESUME. Work History: Senior Product Manager. Managed lifecycle of core SaaS platform. Education: MBA from Stanford. Skills: Agile, Scrum, JIRA.", "RESUME"),
            
            # Invoices
            ("INVOICE. Invoice Number: INV-2026-001. Date: 2026-07-17. Bill To: Acme Corp. Description: Software Development Services. Amount Due: $5,000. Please pay by due date.", "INVOICE"),
            ("TAX INVOICE. Invoice Date: Jan 15, 2026. Vendor: Global Tech Solutions. Customer ID: 9942. Total Amount: $1,250.00. Payment Terms: Net 30.", "INVOICE"),
            ("INVOICE. Bill To: John Smith. Invoice #10423. Qty 1 Laptop $1,200. Total: $1,200.00. Balance Due: $1,200.00. Thank you for your business.", "INVOICE"),
            ("Purchase Invoice. Supplier: Office Supplies Ltd. Client: Saurabh Kulkarni. Total Due: $150.00. Due Date: 2026-08-01.", "INVOICE"),
            
            # Receipts
            ("Walmart Receipt. Store #1234. 1 Milk $3.49, 1 Bread $2.49, 1 Eggs $1.99. Subtotal: $7.97. Tax: $0.64. Total Paid: $8.61. Cash change. Thank you for shopping with us!", "RECEIPT"),
            ("STARBUCKS. Store #4521. 1 Caffè Latte $4.75, 1 Croissant $3.25. Total: $8.00. Paid via Visa. Approved: 042153. Cardholder copy.", "RECEIPT"),
            ("Gas Station Receipt. Shell Oil. 10 Gallons Regular Fuel $35.00. Total: $35.00. Mastercard ending in 4423. Transaction date: 2026-07-16.", "RECEIPT"),
            ("Receipt. Restaurant Table 12. 2 Burgers $24.00, 2 Cokes $6.00. Subtotal: $30.00. Total: $30.00. Cash paid.", "RECEIPT"),
            
            # ID Cards
            ("Driver's License. State of Maharashtra. License Number: MH-12-2026042. Name: Saurabh Kulkarni. Date of Birth: 15/08/1999. Expiry Date: 2035. Card Category: Class LMV.", "ID_CARD"),
            ("Republic of India. Aadhaar Card. Unique Identification Authority of India. Government of India. Aadhaar Number: 1234-5678-9012. Name: John Doe. DOB: 01/01/1990. Male.", "ID_CARD"),
            ("National Identity Card. Passport Number: A9423859. Full Name: Jane Smith. Nationality: Indian. Date of Issue: 2024. Date of Expiration: 2029.", "ID_CARD"),
            ("Employee ID Card. DocMind AI Enterprise. Employee Name: Alex Dev. ID Number: DM-420. Department: Engineering.", "ID_CARD"),
        ]
        
        # Unpack texts and labels
        texts = [x[0] for x in self.train_data]
        labels = [x[1] for x in self.train_data]
        
        # 2. Build Scikit-learn classification pipeline
        self.pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(lowercase=True, stop_words='english')),
            ('clf', MultinomialNB(alpha=0.1))
        ])
        
        # Fit model
        self.pipeline.fit(texts, labels)
        
    def classify(self, text: str):
        if not text or not text.strip():
            return "OTHER", 1.0
            
        # Get prediction and probabilities
        pred = self.pipeline.predict([text])[0]
        probs = self.pipeline.predict_proba([text])[0]
        
        # Find index of predicted class in classes_ list
        classes = self.pipeline.classes_
        pred_idx = np.where(classes == pred)[0][0]
        confidence = float(probs[pred_idx])
        
        # If confidence is low, classify as OTHER
        if confidence < 0.35:
            return "OTHER", confidence
            
        return pred, confidence

# Singleton classifier instance
classifier = DocumentClassifier()

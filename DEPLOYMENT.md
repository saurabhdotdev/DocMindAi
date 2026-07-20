# DocMind AI Deployment Guide

This guide details how to deploy the DocMind AI application to cloud hosting platforms (Render and Vercel).

---

## 1. Backend Services (Render.com)

The project includes a Render Blueprint (`render.yaml`) in the root directory. This allows you to deploy the Node.js API Gateway and the Python AI Service together with a single click.

### Steps:
1. Push your repository to **GitHub**.
2. Log in to your account on **[Render.com](https://render.com/)**.
3. Click **New** (top right) $\rightarrow$ select **Blueprint**.
4. Connect your GitHub repository.
5. Render will parse the `render.yaml` blueprint and prompt you to enter the required secrets:
   - **`DATABASE_URL`**: Your production PostgreSQL database connection string (e.g., from Supabase).
   - **`REDIS_URL`**: Your production Redis connection URL (e.g., from Upstash).
   - **`GROQ_API_KEY`**: Your Groq API key.
   - **`GEMINI_API_KEY`**: Your Gemini API key.
6. Click **Approve**. Render will build and deploy both containers (`docmind-api-gateway` and `docmind-ai-service`) automatically.

---

## 2. Frontend Application (Vercel)

The frontend is a Vite single-page application (SPA) pre-configured with routing rules in `frontend/vercel.json`.

### Option A: Using Vercel CLI (Recommended)
Open a terminal in the `/frontend` directory and run:
```bash
npx vercel
```
1. Follow the interactive prompts to log in/sign up.
2. Select **Yes** to set up and deploy the project.
3. Link it to a new project named `docmind-frontend`.
4. When prompted for environment variables, add:
   - **`VITE_API_URL`**: Set this to the production URL of your Render API Gateway (e.g., `https://docmind-api-gateway.onrender.com`).
5. Run `npx vercel --prod` to deploy it live!

### Option B: Using Vercel Dashboard
1. Go to **[Vercel.com](https://vercel.com/)** and log in.
2. Click **Add New** $\rightarrow$ **Project**.
3. Import your GitHub repository.
4. Set the **Root Directory** option to `frontend`.
5. Under Environment Variables, add:
   - Key: `VITE_API_URL`
   - Value: `https://docmind-api-gateway.onrender.com` (your Render gateway URL).
6. Click **Deploy**. Vercel will automatically compile the SPA and serve it on a secure `https` subdomain.

---

## 3. Storage Setup (Supabase)

For production, the gateway is configured to automatically use Supabase Storage if the credentials are set, falling back to local files otherwise.
1. Create a Supabase project at **[Supabase.com](https://supabase.com)**.
2. Go to **Storage** $\rightarrow$ create a **Public Bucket** named `docmind-uploads`.
3. In Render, add these variables to your `docmind-api-gateway` service:
   - `SUPABASE_URL`: (Your Supabase project API URL).
   - `SUPABASE_SERVICE_KEY`: (Your Supabase `service_role` secret key).

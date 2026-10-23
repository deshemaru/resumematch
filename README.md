# ResumeMatch — free setup

HTML, CSS, vanilla JavaScript, and one Cloudflare Worker calling Gemini. No framework, database, login, or build step. This version replaces the original OpenAI integration.

## What you need

- A free GitHub account and a **public** repository for free GitHub Pages hosting. A public repository exposes the website code, not resumes you upload through the app. Do not commit resumes or keys.
- A free Cloudflare account on **Workers Free**.
- A Gemini API project on the **Free Tier**, with an API key and access to `gemini-3.1-flash-lite`.
- A current Node.js LTS installation on your Mac, used only to deploy the Worker.

Stay on the free plans. Do not enable Google Cloud billing or upgrade Cloudflare. Free quotas are limited and can change; if a provider requires payment for your account/region, stop rather than enabling billing. Codex helps edit the files; it does not host the website or supply Gemini quota.

## Setup, in order

1. **Find the files.** In Finder press Command+Shift+G and open this project's `resumematch` folder. It contains `index.html`, `style.css`, `script.js`, `README.md`, `.gitignore`, and `api/` containing `worker.js` and `wrangler.jsonc`. Command+Shift+period shows `.gitignore`.
2. **Create a repository.** On GitHub choose New repository, name it `resumematch`, select Public, and create it. Leave automatic README/license/gitignore additions off. If you already created a private repository, create a separate public one for this website; do not expose unrelated private material.
3. **Set your website origin.** Open `api/wrangler.jsonc` in Codex. Replace `YOUR-USERNAME` in `ALLOWED_ORIGINS` with your GitHub username. For example, `https://alex.github.io`. Keep the quotes/comma. Do not add `/resumematch/`. Save. You can ask Codex to make this edit using your username; do not give Codex your API key.
4. **Upload the project.** On the empty repository click “uploading an existing file” (or Add file → Upload files). Drag the files and the `api` folder into it, preserving the folder. Commit changes. `index.html` must appear at the repository root, not inside another `resumematch` folder. Upload only these project files, not the separate parent React/Python project.
5. **Publish.** Repository Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save. Wait several minutes. Your address will look like `https://YOUR-USERNAME.github.io/resumematch/`. The page opens before the AI function is connected.
6. **Create your free accounts.** Sign in at [Cloudflare](https://dash.cloudflare.com/sign-up) and [Google AI Studio](https://aistudio.google.com/). Keep Cloudflare on Workers Free. In AI Studio open API keys, choose Create API key, and create/select an unbilled project. Confirm its tier is Free. Do not enable billing. Keep the key private; you will paste it into a hidden Terminal prompt below.
7. **Install Node.js.** Install the current macOS LTS installer from [nodejs.org](https://nodejs.org/en/download). Open Terminal via Command+Space → Terminal. Run `node --version`, then `npm --version`. Both should print a version. Reopen Terminal after installing if needed.
8. **Deploy the function.** In Terminal, change to this project's `api` folder. On the original Mac used to create this project:

   ```sh
   cd "/Users/anjiladeshemaru/Documents/New project/resumematch/api"
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GEMINI_API_KEY
   ```

   Run one line at a time. Approve installation of Wrangler if prompted (`y`), sign in to Cloudflare in the browser opened by the login command, and approve its access. Deployment may ask you to choose a free `workers.dev` subdomain. Copy the Worker URL printed by deploy. For the secret command, paste your Gemini key at the hidden prompt and press Return. Never put the key in any tracked file, website field, or chat. The Worker is not usable until its secret is added.
9. **Connect the page.** Open your GitHub Pages site → AI connection → Worker URL. Paste the printed URL, such as `https://resumematch-ai.your-subdomain.workers.dev`, then Save connection. This takes a URL, not an API key. Repeat on other browsers/devices, or set the public `DEFAULT_AI_ENDPOINT` in `script.js` and upload that file again.
10. **Test with synthetic text first.** Paste a made-up resume and job description, complete the privacy review, and tailor. Review the evidence and output, compare, then download DOCX/PDF. Every analysis uses two Gemini requests: rewrite and factual review. No simulated AI fallback is used. Live requests require your deployed function/key and have not been tested with your account.

## Before sending real resume text

Google's unpaid-service terms say not to submit personal, sensitive, or confidential information, and allow product-improvement use including human review. Remove identifying information from **both** input fields before analysis. Names, employers, institutions, clients, work history and unique achievements can identify a person even without contact details; merely deleting email/phone is insufficient. Use generic placeholders as needed. The checkbox is a manual review, not automatic anonymization. If you cannot anonymize the content adequately, do not send it to this free API.

Add real details back into the tailored editor **after analysis**, before downloading. Output edits are not sent to Gemini. Comparison and scoring refer to the anonymized input snapshot. Read [Google's terms](https://ai.google.dev/gemini-api/terms) and check [regional availability](https://ai.google.dev/gemini-api/docs/available-regions). The published website has no login and is public.

## How it works

- Files are parsed locally using PDF.js/Mammoth. Limits: 5 MB, 30 PDF pages, 24,000 characters per input. Scans need OCR elsewhere; encrypted PDFs need unlocking. Check extraction order.
- The score uses original-input evidence: keywords 40%, required qualifications 35%, relevant experience 25%. Unsupported/partial items get zero; absent categories are excluded and weights rescaled. This is not an official ATS score or hiring prediction.
- The Worker checks exact source quotes and new numbers, then asks Gemini for a separate factual review. Failed checks reject the rewrite. AI is not infallible; verify all facts and restore your real details carefully. Manual output edits are not rechecked.
- DOCX/PDF exports use a single column, ordinary text, wrapping, and pagination. PDF embeds Noto Sans (Latin, Greek, Cyrillic); unsupported characters produce an error. DOCX preserves Unicode text.
- Pinned document libraries/font load from jsDelivr when needed. No app database or analytics. Only the Worker URL is saved locally. Inputs remain in page memory, although browsers may independently restore form values. Reviewed text goes through the Worker to Google; neither the public repository nor the app stores resumes server-side. Provider data policies still apply.
- CORS, body-size limits and an approximate per-IP rate limit protect the function. CORS is not authentication: outsiders may still consume free quota. Keep billing disabled and disable the Worker when unused.

## Troubleshooting / updates

- **Website 404:** check `index.html` is at the repository root and Pages uses `main` → `/ (root)`.
- **Cannot connect:** check Worker URL and exact `ALLOWED_ORIGINS`. Opening the Worker URL directly may show an origin error; test through the website instead.
- **Missing key:** rerun `npx wrangler secret put GEMINI_API_KEY` from `api/`.
- **Quota/rate limit:** wait for the limit to reset. Do not upgrade just to fix it. Check your account's actual limits in AI Studio.
- **Model unavailable:** check current free model access. Change `GEMINI_MODEL` only to a supported structured-output text model, then redeploy.
- **Factual review failed:** check extracted text and retry. This is intentionally conservative.
- **Updates:** upload changed frontend files to GitHub. Worker/config changes require running `npx wrangler deploy` again from `api/`.

Official references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Workers Free pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [API keys](https://ai.google.dev/gemini-api/docs/api-key), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

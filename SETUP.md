# CCL Office Management — Deployment Guide
## Total time: ~15 minutes

---

## STEP 1 — Create a free Firebase project

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → name it `ccl-office` → click through (disable Analytics if asked)
3. Once created, click **"Web"** icon (</>) to add a web app
4. Name it `ccl-office-app` → click **Register app**
5. You'll see a config block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ccl-office.firebaseapp.com",
  projectId: "ccl-office",
  ...
};
```

6. **Copy all those values** — you'll need them in Step 3

---

## STEP 2 — Enable Firestore database

1. In Firebase Console → left sidebar → **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** → select a region (asia-south1 for India) → Done

---

## STEP 3 — Paste your Firebase config

Open the file `src/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY_HERE",       // ← replace
  authDomain:        "PASTE_YOUR_AUTH_DOMAIN_HERE",   // ← replace
  projectId:         "PASTE_YOUR_PROJECT_ID_HERE",    // ← replace
  storageBucket:     "PASTE_YOUR_STORAGE_BUCKET_HERE",// ← replace
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID_HERE", // ← replace
  appId:             "PASTE_YOUR_APP_ID_HERE",        // ← replace
};
```

---

## STEP 4 — Change your Admin PIN (optional but recommended)

Open `src/App.js`, line 8:
```js
const ADMIN_PIN = "1234"; // ← Change to your preferred PIN
```

---

## STEP 5 — Deploy to Vercel (free hosting)

1. Go to https://github.com and create a free account if you don't have one
2. Create a **new repository** called `ccl-office`
3. Upload all the files from this folder into that repository

   OR if you have Git installed:
   ```bash
   cd ccl-office-app
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/YOUR_USERNAME/ccl-office.git
   git push -u origin main
   ```

4. Go to https://vercel.com → Sign up with GitHub
5. Click **"Add New Project"** → import your `ccl-office` repository
6. Click **Deploy** — Vercel auto-detects React

Your app will be live at: `https://ccl-office.vercel.app` (or similar)

---

## STEP 6 — Share the URL

- Send the URL to all staff — they bookmark it on their phone
- You use the same URL, tap **Admin**, enter your PIN

---

## Notes

- Firebase free tier (Spark plan) allows 50,000 reads + 20,000 writes/day — more than enough for CCL
- Data is real-time: when anyone submits a leave, you see it instantly
- To change PIN later, edit `src/App.js` line 8 and redeploy (Vercel auto-redeploys on GitHub push)
- To secure Firestore properly later, set up Firebase Security Rules

---

## Folder structure

```
ccl-office-app/
├── public/
│   └── index.html
├── src/
│   ├── App.js          ← main app (edit PIN here)
│   ├── firebase.js     ← paste your Firebase config here
│   └── index.js
├── package.json
└── SETUP.md            ← this file
```

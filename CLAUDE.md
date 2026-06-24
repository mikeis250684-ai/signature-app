# מערכת חתימה דיגיטלית מרחוק — מיכאל קרויטרו

## מה זה
אפליקציית Node.js לשליחת מסמכי PDF ללקוחות לחתימה דיגיטלית מרחוק.
סוכן ביטוח (מיכאל) מעלה PDF, מסמן מיקומי חתימה, שולח קישור ללקוח → הלקוח חותם → PDF חתום נשמר.

## מצב הפרויקט
- **קוד**: https://github.com/mikeis250684-ai/signature-app
- **אפליקציה חיה**: https://signature-app-pztj.onrender.com
- **פאנל ניהול**: https://signature-app-pztj.onrender.com/admin.html

## ארכיטקטורה
```
signature-app/
├── server/
│   ├── index.js              # Express server (port 3000)
│   ├── routes/
│   │   ├── admin.js          # ניהול: העלאה, שדות, שליחה, הורדה
│   │   └── sign.js           # חתימה: טוקן, הגשה, finalizePdf
│   ├── lib/
│   │   ├── supabase.js       # Supabase client
│   │   └── pdf.js            # burn חתימות ל-PDF
│   └── assets/
│       └── Heebo-Bold.woff2  # פונט עברי לחתימה
├── public/
│   ├── admin.html            # פאנל הניהול (SPA)
│   └── sign.html             # דף החתימה ללקוח
├── package.json
├── render.yaml               # הגדרות Render
└── supabase_schema.sql       # סכמת DB
```

## שירותים חיצוניים
| שירות | שימוש |
|--------|--------|
| **Supabase** | DB (documents, signers, signature_fields, signatures) + Storage bucket "pdfs" |
| **Resend** | שליחת מיילים (from: noreply@mkt.co.il) |
| **Render** | hosting |
| **GitHub** | mikeis250684-ai/signature-app |

## משתני סביבה נדרשים (.env)
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
RESEND_API_KEY=re_...
ADMIN_PASSWORD=סיסמה-לפאנל
ADMIN_EMAIL=michael@mkt.co.il
APP_URL=https://signature-app-pztj.onrender.com
PORT=3000
```

## זרימת העבודה
1. אדמין מעלה PDF → שמור ב-Supabase Storage (bucket: pdfs)
2. אדמין מסמן שדות חתימה ומוסיף חותמים
3. מערכת מחזירה קישור ייחודי לכל חותם (token UUID)
4. חותם פותח קישור → רואה PDF → חותם → שולח
5. כל חתימה → מייל לאדמין
6. כולם חתמו → PDF חתום נוצר + מייל לאדמין עם קישור הורדה

## הפעלה מקומית
```bash
git clone https://github.com/mikeis250684-ai/signature-app.git
cd signature-app
npm install
# צור .env עם הערכים מלמעלה
node server/index.js
```
פתח: http://localhost:3000/admin.html

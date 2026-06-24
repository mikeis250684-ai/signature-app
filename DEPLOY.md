# פריסת עותק עצמאי — מערכת חתימה דיגיטלית

כל משתמש מקבל מערכת נפרדת לגמרי: DB שלו, Storage שלו, כתובת שלו.

---

## שלב 1 — Supabase (בסיס נתונים + קבצים)

1. כנס ל **https://supabase.com** → **Sign Up** (חשבון חינמי)
2. לחץ **New Project** → תן שם → בחר סיסמת DB → **Create Project**
3. אחרי שהפרויקט עלה, לך ל **SQL Editor** → הדבק את כל התוכן מהקובץ `supabase_schema.sql` → **Run**
4. לך ל **Storage** → **New bucket** → שם: `pdfs` → **Private** → **Save**
5. שמור את הפרטים הבאים (מ **Settings → API**):
   - `Project URL` (נראה כך: https://xxxx.supabase.co)
   - `service_role` key (תחת "Project API keys")

---

## שלב 2 — Resend (מיילים)

1. כנס ל **https://resend.com** → **Sign Up**
2. לך ל **API Keys** → **Create API Key**
3. שמור את המפתח (מתחיל ב `re_`)

> **הערה:** כדי לשלוח מיילים מדומיין מותאם (כמו noreply@שלך.com) צריך לאמת דומיין.  
> לבדיקה ראשונית אפשר לשלוח מ-`onboarding@resend.dev` ← שנה בקוד בקובץ `server/routes/sign.js` שורה 9.

---

## שלב 3 — Render (אחסון האפליקציה)

1. כנס ל **https://render.com** → **Sign Up** (חינמי)
2. לחץ **New** → **Web Service**
3. חבר את GitHub ובחר את ה-repo: `mikeis250684-ai/signature-app`
   - אם אין גישה — **Fork** את הרפו קודם לחשבון GitHub שלך
4. הגדרות:
   - **Name**: כל שם שתרצה
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. תחת **Environment Variables** — הוסף את כל הפרטים:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | ה-URL מ-Supabase |
| `SUPABASE_SERVICE_KEY` | ה-service_role key |
| `RESEND_API_KEY` | המפתח מ-Resend |
| `ADMIN_PASSWORD` | סיסמה שתבחר לכניסה לפאנל |
| `ADMIN_EMAIL` | המייל שלך לקבלת התראות |
| `APP_URL` | הכתובת של Render (תדע אחרי deploy) |

6. לחץ **Create Web Service** — Render יבנה ויפרוס (~3 דקות)
7. אחרי שעלה — העתק את הכתובת (נראית כך: `https://שם-שלך.onrender.com`)
8. חזור ל-Environment Variables → עדכן `APP_URL` לכתובת הזו → **Save**

---

## סיום

פתח: `https://שם-שלך.onrender.com/admin.html`

הכנס עם הסיסמה שהגדרת ב-`ADMIN_PASSWORD` — המערכת מוכנה.

---

## סיכום משאבים

| שירות | עלות | הערה |
|--------|------|-------|
| Supabase | חינם | עד 500MB DB, 1GB Storage |
| Render | חינם | נרדם אחרי 15 דק חוסר פעילות |
| Resend | חינם | עד 3,000 מיילים/חודש |

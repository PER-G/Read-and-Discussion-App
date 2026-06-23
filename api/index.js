// Vercel Serverless-Function: stellt die Express-App unter /api/* bereit.
// Die vercel.json leitet alle /api/...-Anfragen hierher.
import app from '../server/app.js'

export default app

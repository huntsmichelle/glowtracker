import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: '1ewBQksRTQXm6UMF6jvdHlFVEAFxSz7SPawGrL4qFsjY',
    range: 'Sheet1!A1:G1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Timestamp',
        'First Name',
        'Email',
        'Managing',
        'Beta Interest',
        'Updates',
        'Source',
      ]],
    },
  });

  return NextResponse.json({ success: true, message: 'Headers set.' });
}

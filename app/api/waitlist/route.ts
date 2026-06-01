import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const SPREADSHEET_ID = '1ewBQksRTQXm6UMF6jvdHlFVEAFxSz7SPawGrL4qFsjY';
const SHEET_NAME = 'Sheet1';

async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      firstName,
      email,
      managing,
      interestedInBeta,
      updates,
      source,
    } = body;

    if (!firstName?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'First name and email are required.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const sheets = await getSheet();
    const timestamp = new Date().toISOString();

    // Columns: Timestamp | First Name | Email | Managing | Beta Interest | Updates | Source
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,
          firstName.trim(),
          email.trim().toLowerCase(),
          Array.isArray(managing) ? managing.join(', ') : managing,
          interestedInBeta ? 'Yes' : 'No',
          updates ? 'Yes' : 'No',
          source || 'direct',
        ]],
      },
    });

    // Email notification via Web3Forms (silent fail — sheet write is critical path)
    if (process.env.WEB3FORMS_KEY) {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: process.env.WEB3FORMS_KEY,
          subject: `New tend, too waitlist signup — ${firstName}`,
          from_name: 'tend, too waitlist',
          to: 'tendtooapp@gmail.com',
          message: `
New signup:
Name: ${firstName}
Email: ${email}
Managing: ${Array.isArray(managing) ? managing.join(', ') : managing}
Beta interest: ${interestedInBeta ? 'Yes' : 'No'}
Updates: ${updates ? 'Yes' : 'No'}
Source: ${source || 'direct'}
Time: ${timestamp}
          `.trim(),
        }),
      }).catch(err => console.error('Web3Forms notification failed:', err));
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Waitlist submission error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

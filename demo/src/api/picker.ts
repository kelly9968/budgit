import { getAccessToken } from './gis';

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string;
const APP_ID = import.meta.env.VITE_GOOGLE_PROJECT_NUMBER as string;

if (!API_KEY) throw new Error('VITE_GOOGLE_API_KEY is not set');
if (!APP_ID) throw new Error('VITE_GOOGLE_PROJECT_NUMBER is not set');

// ── gapi + picker module loader ──────────────────────────────────────
let pickerReady: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (pickerReady) return pickerReady;
  pickerReady = new Promise((resolve, reject) => {
    const start = Date.now();
    const waitForGapi = () => {
      if (window.gapi) {
        window.gapi.load('picker', () => {
          if (window.google?.picker) resolve();
          else reject(new Error('picker module loaded but google.picker missing'));
        });
        return;
      }
      if (Date.now() - start > 10_000) {
        reject(new Error('gapi load timeout'));
        return;
      }
      setTimeout(waitForGapi, 50);
    };
    waitForGapi();
  });
  return pickerReady;
}

// ── Show the picker, resolve with the selected spreadsheet ID ────────
export async function pickSpreadsheet(): Promise<{ id: string; name: string } | null> {
  await loadPicker();
  const token = await getAccessToken();

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setMode('list')
      .setIncludeFolders(false);

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle('Pick a spreadsheet')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          if (doc) {
            picker.dispose();
            resolve({ id: doc.id, name: doc.name });
            return;
          }
        }
        if (data.action === google.picker.Action.CANCEL) {
          picker.dispose();
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

// Minimal type declarations for the slices of GIS / gapi we actually call.
// The official typings are heavy and not always up to date — we only need
// enough surface area for the token client + ID button + Picker.

declare namespace google.accounts.id {
  interface CredentialResponse {
    credential: string; // JWT
    select_by: string;
  }
  interface IdConfiguration {
    client_id: string;
    callback: (resp: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }
  interface ButtonOptions {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number | string;
  }
  function initialize(config: IdConfiguration): void;
  function renderButton(parent: HTMLElement, opts: ButtonOptions): void;
  function disableAutoSelect(): void;
  function prompt(): void;
}

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: 'Bearer';
    error?: string;
  }
  interface TokenClientConfig {
    client_id: string;
    scope: string;
    prompt?: '' | 'none' | 'consent' | 'select_account';
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type: string; message?: string }) => void;
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: '' | 'none' | 'consent' }): void;
  }
  function initTokenClient(config: TokenClientConfig): TokenClient;
  function hasGrantedAllScopes(token: TokenResponse, ...scopes: string[]): boolean;
  function revoke(accessToken: string, done?: () => void): void;
}

// ── Google Picker (loaded via gapi.load('picker')) ───────────────────
declare namespace google.picker {
  enum ViewId {
    SPREADSHEETS = 'spreadsheets',
  }
  enum Action {
    PICKED = 'picked',
    CANCEL = 'cancel',
    LOADED = 'loaded',
  }
  enum Feature {
    NAV_HIDDEN = 'navHidden',
    SUPPORT_DRIVES = 'sdr',
  }
  interface Document {
    id: string;
    name: string;
    mimeType: string;
    url: string;
  }
  interface ResponseObject {
    action: Action;
    docs?: Document[];
  }
  class View {
    constructor(viewId: ViewId);
    setMimeTypes(mimeTypes: string): View;
  }
  class DocsView extends View {
    constructor(viewId?: ViewId);
    setIncludeFolders(b: boolean): DocsView;
    setSelectFolderEnabled(b: boolean): DocsView;
    setOwnedByMe(b: boolean): DocsView;
    setMode(mode: string): DocsView;
  }
  class Picker {
    setVisible(visible: boolean): Picker;
    dispose(): void;
  }
  class PickerBuilder {
    addView(view: ViewId | View): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setAppId(id: string): PickerBuilder;
    setCallback(cb: (data: ResponseObject) => void): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    enableFeature(feature: Feature): PickerBuilder;
    build(): Picker;
  }
}

interface Window {
  google?: typeof google;
  gapi?: {
    load: (modules: string, cb: () => void) => void;
  };
}

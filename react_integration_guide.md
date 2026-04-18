# Engineer Trace Panel — React Integration Guide

This guide provides the full integration path for adding the `EngineerTracePanel` React component to your live application. The panel is designed to be a self-contained, slide-in drawer for displaying decision trace and chain-of-reasoning data.

## 1. File Placement

Copy the entire `engineer-trace-panel` folder (containing the 5 source files) into your frontend application's component directory.

```
your-react-app/
└── src/
    └── components/
        └── engineer-trace-panel/  <-- Paste folder here
            ├── EngineerTracePanel.tsx
            ├── EngineerTracePanel.css
            ├── mockTraceApi.ts
            ├── tracePanelApi.ts
            └── types.ts
```

## 2. Component Rendering

In your parent page or component, import the `EngineerTracePanel` and render it conditionally based on your application's state. The panel is a modal overlay and will handle its own visibility.

**Example:**

```tsx
import React, { useState } from 'react';
import EngineerTracePanel from './components/engineer-trace-panel/EngineerTracePanel';

export default function YourPageComponent() {
  const [showTracePanel, setShowTracePanel] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  function handleShowTrace(eventId: string) {
    setSelectedEventId(eventId);
    setShowTracePanel(true);
  }

  return (
    <div>
      {/* Your page content */}
      <button onClick={() => handleShowTrace('evt_001')}>
        View Engineer Trace
      </button>

      {/* Render the panel when showTracePanel is true */}
      {showTracePanel && selectedEventId && (
        <EngineerTracePanel
          eventId={selectedEventId}
          onClose={() => setShowTracePanel(false)}
        />
      )}
    </div>
  );
}
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `eventId` | `string` | Yes | The unique ID of the event to fetch the trace for. |
| `onClose` | `() => void` | Yes | Callback function to close the panel, typically by setting your state variable to `false`. |

## 3. Backend API Proxy

The `EngineerTracePanel` component fetches data from a backend endpoint. You must configure your backend proxy to forward requests made to `/api/recommendation/{eventId}/trace` to your actual trace service.

**Endpoint:** `GET /api/recommendation/{eventId}/trace`

**Expected Response:** A JSON object matching the `RecommendationTraceResponse` interface defined in `types.ts`.

**Example Backend Proxy (Node.js/Express):**

```javascript
// server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy API requests to your actual trace service
app.use('/api', createProxyMiddleware({
  target: 'https://your-actual-api-service.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // or whatever path your service expects
  },
}));

// Serve your React app
app.use(express.static('build'));

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## 4. Mock API for Frontend Development

If your backend is not yet ready, you can use the built-in mock API to develop and test the panel frontend in isolation. The mock intercepts `fetch` requests and returns static data.

To activate it, call `installTraceFetchMock()` once when your application starts (e.g., in your main `index.tsx` or `App.tsx`).

**Example:**

```tsx
// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import and install the mock for development
import { installTraceFetchMock } from './components/engineer-trace-panel/mockTraceApi';
if (process.env.NODE_ENV === 'development') {
  installTraceFetchMock();
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

This setup ensures the mock only runs in your local development environment and will not be included in your production build.

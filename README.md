# Tupi DRRM Prototype

This prototype demonstrates a Tupi incident reporting system with:
- incident reporting module for citizens and barangay users
- GPS-based location capture and offline SMS fallback
- media uploads for photos, videos, and audio files
- AI emergency chatbot-style assistant for first-aid guidance
- admin map dashboard with colored severity markers
- admin logs, incident updates, and incident review

## Features

- **Incident report form** with location, incident type, severity, victim details, and media
- **Emergency assistant** that simulates instructions for common emergencies
- **Quick recorder** that captures camera and microphone evidence in-browser
- **Offline SMS fallback** text generator with GPS coordinates
- **Admin dashboard** showing incidents on a Tupi map with severity colours:
  - Grey = neutral / not yet assessed
  - Green = minor incident
  - Yellow = moderate but risky
  - Red = emergency needs immediate attention
  - Black = very severe, multiple victims

## Getting started

1. Open a terminal in this folder.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in your browser.
5. Use `http://localhost:3000/admin.html` for the admin dashboard.

## Notes

- This is a functional prototype built with Node.js, Express, and browser APIs.
- The app stores reports in `db.json` and uploaded files in `uploads/`.
- Offline SMS fallback is simulated for environments where the browser cannot send reports.
- Shortcut-style emergency recording is supported through a quick record button.

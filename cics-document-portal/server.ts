import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import multer from "multer";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import DOMException from 'node-domexception';

if (!globalThis.DOMException) {
  globalThis.DOMException = DOMException;
}

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/callback"
);

const upload = multer({ dest: "uploads/" });

async function startServer() {
  // API Routes
  app.get("/api/auth/url", (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const redirectUri = `${protocol}://${host}/auth/callback`;

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/drive.file"],
      prompt: "consent",
      redirect_uri: redirectUri
    });
    res.json({ url });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const redirectUri = `${protocol}://${host}/auth/callback`;

    try {
      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri
      });
      res.cookie("google_drive_tokens", JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    const tokens = req.cookies.google_drive_tokens;
    res.json({ isAuthenticated: !!tokens });
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    const tokens = req.cookies.google_drive_tokens;
    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated with Google Drive" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials(JSON.parse(tokens));

      const drive = google.drive({ version: "v3", auth });
      const fileMetadata = {
        name: req.file.originalname,
      };
      const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path),
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, webViewLink, webContentLink",
      });

      // Set permissions to anyone with link can view
      await drive.permissions.create({
        fileId: response.data.id!,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      // Clean up local file
      fs.unlinkSync(req.file.path);

      res.json({
        id: response.data.id,
        url: response.data.webViewLink,
        downloadUrl: response.data.webContentLink,
      });
    } catch (error) {
      console.error("Error uploading to Google Drive:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.delete("/api/delete/:fileId", async (req, res) => {
    const tokens = req.cookies.google_drive_tokens;
    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated with Google Drive" });
    }

    const { fileId } = req.params;

    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials(JSON.parse(tokens));

      const drive = google.drive({ version: "v3", auth });
      await drive.files.delete({ fileId });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting from Google Drive:", error);
      res.status(500).json({ error: "Delete failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

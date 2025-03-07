const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

require('dotenv').config();
const config = {
  clientId: process.env.CLIENT_ID,
  projectId: process.env.PROJECT_ID,
  authUri: process.env.AUTH_URI,
  tokenUri: process.env.TOKEN_URI,
  authProviderCertUrl: process.env.AUTH_PROVIDER_CERT_URL,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
};


// Configuración de Multer
const upload = multer({ storage: multer.memoryStorage() });

// Configuración de Google
const CLIENT_ID = config.clientId;
const CLIENT_SECRET = config.clientSecret;
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];


// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



// Autenticación
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(url);
});

app.get('/auth/check', (req, res) => {
    res.json({ authenticated: oauth2Client.credentials !== null });
  });

// Modificar el callback para almacenar tokens
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Redirigir al frontend con tokens en URL (solo para desarrollo)

    res.redirect(`
      <html>
          <body>
              <script>
                  localStorage.setItem('drive_access_token', '${tokens.access_token}');
                  localStorage.setItem('drive_refresh_token', '${tokens.refresh_token}');
                  window.location.href = 'http://localhost:3000';
              </script>
          </body>
      </html>
  `);
    //res.redirect(`http://localhost:3000?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`);
  });


// Crear carpeta
app.post('/create-folder', async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  try {
    const fileMetadata = {
      name: req.body.name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    res.json({ id: folder.data.id });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Subir archivo
app.post('/upload/:folderId', upload.single('file'), async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  try {
    const { originalname, buffer } = req.file;
    
    const fileMetadata = {
      name: originalname,
      parents: [req.params.folderId],
    };

    const media = {
      mimeType: req.file.mimetype,
      body: require('stream').Readable.from(buffer),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    res.json({ id: file.data.id });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Listar archivos
app.get('/files/:folderId', async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  try {
    const response = await drive.files.list({
      q: `'${req.params.folderId}' in parents`,
      fields: 'files(id, name)',
    });
    res.json(response.data.files);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Eliminar archivo
app.delete('/file/:fileId', async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  try {
    await drive.files.delete({
      fileId: req.params.fileId,
    });
    res.sendStatus(204);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Ruta para SPA (debe ir después de los archivos estáticos y antes de las APIs)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
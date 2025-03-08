// server.js
const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const multer = require('multer');
require('dotenv').config();
var os = require("os");
var hostname = os.hostname();
const app = express();
const port = process.env.PORT || 3000;

const config = {
  clientId: process.env.CLIENT_ID,
  projectId: process.env.PROJECT_ID,
  authUri: process.env.AUTH_URI,
  tokenUri: process.env.TOKEN_URI,
  authProviderCertUrl: process.env.AUTH_PROVIDER_CERT_URL,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
};

console.log(hostname);

// Middleware para parsear JSON y formularios urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configura Multer para manejo de archivos (almacenamiento temporal en 'uploads/')
const upload = multer({ dest: 'uploads/' });

// Configuración de OAuth2 (usa variables de entorno o reemplaza directamente)
const CLIENT_ID = process.env.CLIENT_ID || config.clientId;
const CLIENT_SECRET = process.env.CLIENT_SECRET || config.clientSecret;
// Usa un REDIRECT_URI que se adapte al entorno actual (desarrollo o producción)
const REDIRECT_URI = ( hostname === 'MacBookPro.local' ) 
? 'http://localhost:3000/oauth2callback' 
: 'https://drive-app-server.onrender.com/oauth2callback';

// Inicializar OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);


// Puedes guardar y cargar los tokens de forma persistente según necesites
// Por simplicidad, en este ejemplo se almacenan en memoria

// Ruta para iniciar la autenticación
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Permite obtener refresh_token
    scope: ['https://www.googleapis.com/auth/drive'],
  });
  res.redirect(authUrl);
});

// Callback de OAuth2
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    res.send('Autenticación exitosa! Ya puedes usar la aplicación.');
  } catch (error) {
    console.error('Error al obtener tokens:', error);
    res.status(500).send('Error en la autenticación');
  }
});

// Inicializar el cliente de Google Drive
const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Endpoint: Crear una carpeta
 * Método: POST
 * Body: { folderName: "Nombre de la carpeta" }
 */
app.post('/createFolder', async (req, res) => {
  try {
    const fileMetadata = {
      name: req.body.folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    res.json({ folderId: folder.data.id });
  } catch (error) {
    console.error('Error creando carpeta:', error);
    res.status(500).send(error);
  }
});

/**
 * Endpoint: Subir uno o varios archivos (fotos) a una carpeta determinada
 * Método: POST
 * Body (form-data):
 *    - folderId: ID de la carpeta destino
 *    - files: uno o varios archivos
 */
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const folderId = req.body.folderId;
    const filesData = [];
    for (const file of req.files) {
      const fileMetadata = {
        name: file.originalname,
        parents: [folderId],
      };
      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      };
      const fileUpload = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });
      filesData.push({ id: fileUpload.data.id, name: file.originalname });
      // Eliminar el archivo temporal
      fs.unlinkSync(file.path);
    }
    res.json({ uploaded: filesData });
  } catch (error) {
    console.error('Error subiendo archivos:', error);
    res.status(500).send(error);
  }
});

/**
 * Endpoint: Listar archivos de una carpeta determinada
 * Método: GET
 * Query Params: folderId
 */
app.get('/list', async (req, res) => {
  try {
    const folderId = req.query.folderId;
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
    });
    res.json(response.data.files);
  } catch (error) {
    console.error('Error listando archivos:', error);
    res.status(500).send(error);
  }
});

/**
 * Endpoint: Borrar un archivo determinado
 * Método: DELETE
 * Body: { fileId: "ID del archivo a borrar" }
 */
app.delete('/delete', async (req, res) => {
  try {
    const fileId = req.body.fileId;
    await drive.files.delete({ fileId });
    res.sendStatus(200);
  } catch (error) {
    console.error('Error borrando archivo:', error);
    res.status(500).send(error);
  }
});

const path = require('path');

// Servir archivos estáticos desde la carpeta "dist"
app.use(express.static(path.join(__dirname, 'dist')));

// Para cualquier otra ruta, devolver el archivo index.html de React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});

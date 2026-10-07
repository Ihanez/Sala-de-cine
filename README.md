# Sala de cine para dos

Comparte tu pantalla (con audio) con una sola persona y miren películas a distancia.
Usa WebRTC con PeerJS: el video va directo entre ustedes dos, sin pasar por un servidor propio.
Sin cámara, sin llamadas, sin cuentas.

## Uso
1. Quien transmite abre la página, pulsa **Crear sala** y comparte el código o el enlace.
2. La otra persona abre el enlace (o escribe el código y pulsa **Entrar**).
3. El anfitrión elige una de dos opciones:
   - **Compartir pantalla**: elige una **pestaña** y marca **compartir audio**.
   - **Reproducir un archivo**: elige una película de su computador (MP4/H.264 o WebM, en Chrome o Edge). No sale negro, el audio va incluido y la calidad es mejor. Se controla con el reproductor de la página.

## Subir a GitHub
```bash
git init
git add .
git commit -m "Sala de cine para dos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/sala-de-cine.git
git push -u origin main
```

## Desplegar en Vercel
1. Entra a vercel.com → **Add New → Project** e importa el repositorio.
2. Framework Preset: **Other**. Sin comando de build ni carpeta de salida.
3. Pulsa **Deploy**. Es un sitio estático, no necesita configuración extra.

## Limitaciones
- Netflix, Disney+, Prime y similares usan DRM y se ven en negro al capturarlos.
- Transmitir solo funciona desde computador. Mirar funciona también en celular.
- Si alguna red bloquea la conexión directa, agrega un servidor TURN en `CONFIG.iceServers` (`app.js`).
- La calidad depende de la velocidad de subida de quien transmite.

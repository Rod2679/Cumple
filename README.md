# Para Ali — regalo web de cumpleaños

Una experiencia interactiva creada para el cumpleaños 19 de Ali:

- velitas que se apagan una por una para pedir un deseo;
- pastel que se puede morder solo después de apagar las velas;
- regalo que aparece cuando el pastel desaparece por completo;
- ilustración sorpresa del conejito en su carrito al abrir el regalo;
- carta flotante que abre una sola carta continua;
- fotografía de Ali de pequeña, título de cumpleaños y el texto completo con efecto de escritura;
- nube de recuerdo en pixel art que aparece únicamente al terminar de escribirse la carta;
- minijuego de Casa de Cultura que se abre desde la nube, con personajes animados, controles táctiles y de teclado, música y cinemática;
- canciones de Ariana Grande y Sabrina Carpenter en orden aleatorio;
- foto musical colgada de una cuerda que baja, permanece 10 segundos y vuelve a subir;
- fragmentos oficiales muy breves que se escriben junto a la carta y cambian de posición;
- cambio automático de canción y color cada 10 segundos.

## Foto y texto principal

La foto principal se encuentra en `public/memories/ali-de-pequena.jpeg`.
La ilustración que aparece dentro del regalo se encuentra en `public/gift-surprise.jpeg`.
Los recursos del minijuego se encuentran en `public/game-assets` y su componente principal en `app/MemoryGame.tsx`.
La única carta está reunida en `birthdayLetter`, dentro de `app/page.tsx`, y aparece poco a poco cuando se abre el sobre.

Para sustituir la imagen, conserva el mismo nombre de archivo. Para editar la carta, cambia únicamente los párrafos dentro de `birthdayLetter`.

## Música

La selección de cumpleaños se encuentra en `soundtrack`, dentro de `app/page.tsx`. Mezcla canciones de Ariana Grande y Sabrina Carpenter, se reorganiza al azar en cada visita y cambia cada 10 segundos. Cada canción usa una paleta propia que controla el fondo y un fragmento breve que se escribe en una posición distinta.

El reproductor intenta comenzar después de la primera interacción. Si Safari u otro navegador bloquea el audio automático, aparece un aviso grande con el botón `tocar para escuchar ♫`. El cambio de color, el fragmento y el contador de 10 segundos esperan hasta que Spotify confirme que la canción realmente está sonando; así la experiencia no avanza en silencio. Si Spotify está bloqueado por el navegador, el aviso también incluye un enlace directo a la canción.

## Ejecutar el proyecto

Requiere Node.js 22 o una versión posterior.

```bash
npm install
npm run dev
```

## Subir a GitHub

Este paquete ya está configurado para el repositorio `Cumple`:

1. Descomprime el proyecto y sube todos sus archivos al repositorio `Cumple`.
2. En GitHub abre `Settings` → `Pages`.
3. En `Source`, selecciona `GitHub Actions`.
4. Abre la pestaña `Actions` y espera a que termine `Publicar Cumple en GitHub Pages`.
5. La dirección tendrá el formato `https://TU-USUARIO.github.io/Cumple/`.

Cada cambio que subas a la rama `main` volverá a publicar la página automáticamente. No elijas `Deploy from a branch`.

El proyecto ya incluye `.gitignore` y todos los archivos necesarios para conservar las animaciones, la música y el diseño adaptable a celular.

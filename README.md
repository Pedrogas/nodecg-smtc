# nodecg-smtc

Bundle de NodeCG v2 que muestra "Now Playing" usando [SMTC Bridge](https://github.com/nuttylmao/smtc-bridge).

## Instalación
1. Ejecuta SMTC Bridge en Windows (por defecto expone `http://127.0.0.1:5000/now-playing`).
2. Copia esta carpeta a `nodecg/bundles`.
3. Inicia NodeCG (necesita Node 18 o superior).
4. En OBS agrega una Browser Source con:
   `graphics/now-playing.html`
   Tamaño 640x160. Agrega `?showPaused=1` si quieres que siga visible en pausa.

## Configuración (opcional)
Crea `nodecg/cfg/nodecg-smtc.json`:

    {
      "apiUrl": "http://127.0.0.1:5000/now-playing",
      "pollIntervalMs": 1000
    }

Si NodeCG corre en otra máquina distinta a la de SMTC Bridge, el puerto 127.0.0.1 no será
accesible: necesitarás un túnel o que la extension corra en la misma PC.

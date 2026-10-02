# SFIDA · Control de salidas y devoluciones de almacén

App de escritorio Electron para una sola PC con Windows, offline, base SQLite local.

## Dominio
El almacén entrega prendas a tres áreas (Lavandería, Diseño, Acabados) mediante BOLETAS DE SALIDA.
Las áreas devuelven mediante BOLETAS DE RETORNO propias, con su propio número, y mezclan prendas
de varias salidas en un mismo retorno. El sistema reparte automáticamente lo que llega contra las
boletas de salida pendientes, saldando primero la más antigua (FIFO), con vista previa editable.

## Reglas que nunca se rompen
1. Toda validación vive en el proceso main. La UI no valida, solo muestra.
2. Guardar un retorno es UNA transacción: retorno + items + asignaciones + recálculo de estados.
3. Nunca asignar más de lo pendiente. El pendiente se relee de la base al guardar, no se confía en la UI.
4. cantidad_devuelta de una línea SIEMPRE debe igualar la suma de sus asignaciones.
5. Nada se borra: se anula con motivo (boletas, retornos, áreas y encargados incluidos).
6. El renderer nunca toca la base. Todo pasa por IPC con contextIsolation activo.
7. Todo texto ingresado por el usuario en modelo, talla, color, nombre de encargado, nombre de área,
   número de boleta y número de retorno se normaliza a MAYÚSCULAS, sin espacios dobles ni al borde,
   tanto en el renderer (mientras se escribe) como en el main (antes de guardar). La observación y el
   motivo de anulación quedan como texto libre, sin normalizar.

## Referencia visual
docs/prototipo-completo-sfida-almacen.html — respetar layout, colores y nombres de pantallas.

## Paleta
fondo #141013 · panel #1C181B · borde #2E292F · texto #EDE7EA · apagado #9B9098
vino #9B2E48 · vino suave #3A1A24 · verde #3E8E5A · ámbar #C08A2E · falta #F08AA0
Números siempre con font-variant-numeric: tabular-nums.

## Stack
Electron + electron-builder + SheetJS (xlsx). HTML/CSS/JS vanilla, sin frameworks.
Base de datos en app.getPath('userData').

## Boleta impresa
Solo las SALIDAS emiten papel. El retorno no imprime nada: su numero y su comprobante los trae el area.
8. El documento que se imprime se arma en una ventana oculta aparte (`src/main/impresion/`); nunca se
   imprime la ventana de la aplicacion.
9. El tamano de letra del ticket se MIDE en el documento, no se fija: 42 caracteres a 10 pt no entran
   en 69 mm y cada PC tiene fuentes distintas.
10. La boleta se pega al borde izquierdo de la hoja, nunca centrada: cuando se imprime sin pedirle
    medida a la impresora, la hoja que arma Chromium es carta (216 mm) y centrar la saca del rollo.
11. La vista previa del renderer va en un shadow root, con la misma letra y el mismo relleno del
    documento real. Si entran los estilos de la aplicacion, la previa miente sobre lo unico que sirve.
12. La ventana oculta de la boleta nunca puede ser la ultima viva: `window-all-closed` consulta
    `hayBoletasAbiertas()` antes de cerrar la app.

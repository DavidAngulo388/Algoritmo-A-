let map = L.map("map").setView([29.073, -110.955], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let datosOriginal = {}, datosGrafo = {};
let marcadorInicio = null, marcadorDestino = null, rutaActual = null;

fetch("grafo_osm_limpio.json")
  .then(res => res.json())
  .then(data => {
    datosOriginal = data;
    datosGrafo = JSON.parse(JSON.stringify(data));
  });

map.on("click", e => {
  if (!marcadorInicio) {
    marcadorInicio = crearMarcador(e.latlng, "Inicio");
    actualizarStatus("Inicio colocado. Ahora selecciona el destino.");
  } else if (!marcadorDestino) {
    marcadorDestino = crearMarcador(e.latlng, "Destino");
    actualizarStatus("Destino colocado. Ahora calcula la ruta.");
  }
});

function crearMarcador(latlng, label) {
  const nodo = nodoMasCercano(latlng.lat, latlng.lng);
  const marker = L.marker([nodo.lat, nodo.lon], { draggable: true }).addTo(map);
  marker.bindPopup(label).openPopup();
  marker.on("dragend", () => {
    const snap = nodoMasCercano(marker.getLatLng().lat, marker.getLatLng().lng);
    marker.setLatLng([snap.lat, snap.lon]);
    if (rutaActual) {
      map.removeLayer(rutaActual);
      rutaActual = null;
      actualizarStatus("Marcador movido. Vuelve a calcular la ruta.");
    }
  });
  return marker;
}

function heuristica(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nodoMasCercano(lat, lon) {
  let min = Infinity, cercano = null;
  for (let n of datosGrafo.nodes) {
    const d = heuristica({ lat, lon }, n);
    if (d < min) { min = d; cercano = n; }
  }
  return cercano;
}

function vecinos(id) {
  return datosGrafo.links
    .filter(l => l.source === id)
    .map(l => ({ id: l.target, distancia: l.distancia, delta_temp: l.delta_temp }));
}

function calcularRuta() {
  if (!marcadorInicio || !marcadorDestino) return alert("Selecciona ambos puntos.");
  const nodoInicio = nodoMasCercano(marcadorInicio.getLatLng().lat, marcadorInicio.getLatLng().lng);
  const nodoDestino = nodoMasCercano(marcadorDestino.getLatLng().lat, marcadorDestino.getLatLng().lng);

  const abiertos = [{ nodo: nodoInicio, costo: 0 }];
  const gScore = { [nodoInicio.id]: 0 };
  const cameFrom = {};
  const cerrado = new Set();

  while (abiertos.length > 0) {
    abiertos.sort((a, b) => a.costo - b.costo);
    const actual = abiertos.shift().nodo;

    if (actual.id === nodoDestino.id) return trazarRuta(cameFrom, nodoDestino.id);
    cerrado.add(actual.id);

    for (let v of vecinos(actual.id)) {
      if (cerrado.has(v.id)) continue;
      const costo = 0.4 * v.distancia + 0.6 * v.delta_temp;
      const tentative = gScore[actual.id] + costo;

      if (!(v.id in gScore) || tentative < gScore[v.id]) {
        gScore[v.id] = tentative;
        cameFrom[v.id] = actual.id;
        const nodoV = datosGrafo.nodes.find(n => n.id === v.id);
        const estimado = tentative + heuristica(nodoV, nodoDestino);
        abiertos.push({ nodo: nodoV, costo: estimado });
      }
    }
  }

  alert("No se encontró una ruta.");
}

function trazarRuta(cameFrom, idFinal) {
  let ruta = [], actual = idFinal;
  while (actual) {
    const n = datosGrafo.nodes.find(n => n.id === actual);
    ruta.push([n.lat, n.lon]);
    actual = cameFrom[actual];
  }
  if (rutaActual) map.removeLayer(rutaActual);
  rutaActual = L.polyline(ruta.reverse(), { color: "blue", weight: 5 }).addTo(map);
  map.fitBounds(rutaActual.getBounds());
}

function reiniciar() {
  [marcadorInicio, marcadorDestino, rutaActual].forEach(m => m && map.removeLayer(m));
  marcadorInicio = null;
  marcadorDestino = null;
  rutaActual = null;
  actualizarStatus("Haz clic para colocar los marcadores.");
}

function alternarModo() {
  const activo = document.getElementById("modoPeaton").checked;
  datosGrafo = JSON.parse(JSON.stringify(datosOriginal));
  if (activo) {
    const reversos = datosOriginal.links.map(l => ({
      source: l.target, target: l.source,
      distancia: l.distancia, delta_temp: l.delta_temp
    }));
    datosGrafo.links.push(...reversos);
    actualizarStatus("Modo peatón activado.");
  } else {
    actualizarStatus("Modo vehículo (dirigido) activado.");
  }
}

function actualizarStatus(msg) {
  document.getElementById("status").textContent = msg;
}
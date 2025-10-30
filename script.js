// 🌍 API bazaviy URL
const API_BASE = 'https://backend-api-rtej.onrender.com/api';

// 🔐 URL orqali user_id kelsa — saqlaymiz
const urlParams = new URLSearchParams(window.location.search);
const tgUserId = urlParams.get("user_id");
if (tgUserId) localStorage.setItem("tg_user_id", tgUserId);

// 🌍 Global o‘zgaruvchilar
let map;
let markers = [];
let markerCluster;

// 🗺️ Xaritani ishga tushirish
function initMap() {
    const defaultCenter = [41.2995, 69.2401];

    // Leaflet xarita sozlamalari
    map = L.map('map', {
        preferCanvas: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        zoomControl: true,
        attributionControl: true,
        zoomAnimation: true,
        fadeAnimation: true,
        inertia: true,
        inertiaDeceleration: 2500,
    }).setView(defaultCenter, 12);

    // Retina (2×) uchun yuqori sifatli tile
    const retinaTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
        detectRetina: true,
        crossOrigin: true,
        attribution: '&copy; OpenStreetMap contributors'
    });
    retinaTiles.addTo(map);

    // Marker klaster guruhi
    markerCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    });
    map.addLayer(markerCluster);

    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.disable();
    map.invalidateSize();

    // Agar URLda lat/lon kelsa
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lon = parseFloat(params.get("lon"));

    if (!isNaN(lat) && !isNaN(lon)) {
        const userIcon = L.icon({
            iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
            iconSize: [25, 41],
            iconAnchor: [19, 38],
            popupAnchor: [0, -35]
        });

        const userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
        userMarker.bindPopup(`<div style="text-align:center;"><b>Siz turgan joy</b></div>`);
        map.setView([lat, lon], 14);
    }

    // 🔄 Backend e’lonlarini yuklaymiz
    loadListings();
}

// 📸 Rasm URL generatori
function getPhotoUrl(fileId) {
    if (!fileId) return 'https://via.placeholder.com/150/3498db/ffffff?text=Rasm+Yoq';
    return `${API_BASE}/photos/${encodeURIComponent(fileId)}`;
}

// 🏠 E’lonlarni API dan olish
async function loadListings() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lon = params.get("lon");
    const radius = params.get("radius") || 20;

    let url = `${API_BASE}/listings`;
    if (lat && lon) {
        url = `${API_BASE}/listings/nearby?lat=${lat}&lon=${lon}&radius_km=${radius}`;
        map.setView([parseFloat(lat), parseFloat(lon)], 13);
    }

    try {
        const response = await fetch(url);
        const data = await response.json();
        const listings = Array.isArray(data) ? data : data.listings;

        displayListings(listings);
        hideLoading();

        if (!listings || listings.length === 0)
            console.warn("⚠️ E’lonlar topilmadi yoki format noto‘g‘ri");

    } catch (err) {
        console.error("🚫 E’lonlarni yuklashda xatolik:", err);
        showError();
    }
}

// 🧠 Saqlash (Telegram botga yuborish)
function saveListing(listingId) {
    const userId = localStorage.getItem("tg_user_id");
    if (!userId) return alert("❗Avval Telegram orqali oching!");

    fetch(`${API_BASE}/save-listing/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
    })
        .then(res => res.json())
        .then(() => alert("✅ E’lon Telegramga yuborildi!"))
        .catch(() => alert("❌ Xato! Qayta urinib ko‘ring"));
}

// 🧭 E’lonlarni xaritada ko‘rsatish
function displayListings(listings) {
    markerCluster.clearLayers();
    markers = [];

    if (!listings || listings.length === 0) {
        updateStats(0);
        return;
    }

    listings.forEach(listing => {
        const marker = createMarker(listing);
        markers.push(marker);
        markerCluster.addLayer(marker);
    });

    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
    }

    updateStats(listings.length);

    // ✅ Yangi slayderlar uchun “dot” indikatorlarni qayta ishga tushirish
    setTimeout(initPhotoSliders, 300);
}

// 📍 Marker yaratish
function createMarker(listing) {
    const { latitude, longitude, title, price } = listing;

    const icon = L.divIcon({
        html: `
            <div style="
                background: #e74c3c;
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 14px;
                border: 3px solid white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                white-space: nowrap;">
                ${formatPrice(price)} ${listing.currency || "so'm"}
            </div>`,
        className: 'custom-marker',
        iconSize: [100, 40],
        iconAnchor: [50, 40]
    });

    const marker = L.marker([latitude, longitude], { icon });
    marker.bindPopup(createPopupContent(listing), { maxWidth: 400, className: 'custom-popup', minWidth: 300 });
    return marker;
}

// ☎️ Telefon raqamiga qo‘ng‘iroq qilish
function callNumber(phone) {
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.openLink === "function") tg.openLink(`tel:${phone}`);
    else window.location.href = `tel:${phone}`;
}

// 🪟 Popup content
function createPopupContent(listing) {
    const { id, title, price, description, photos, phone, total_floors, floor_number, distance_km } = listing;
    const phoneDisplay = phone ? `+998${phone.replace(/^(\+?998)?/, '')}` : "No'malum";
    const callButton = phone
        ? `<a href="tel:${phoneDisplay}" target="_blank" class="call-btn">📞 Qo‘ng‘iroq</a>`
        : '';

    const descHTML = `
        <div class="listing-description" id="desc-${id}">
            ${escapeHtml(description || "Tavsif mavjud emas")}
        </div>
        <span class="read-more-btn" onclick="toggleDescription(${id})">Batafsil…</span>
    `;

    const extraInfo = `
        <div class="listing-extra">
            🏢 <b>Qavat:</b> ${floor_number || '-'} / ${total_floors || '-'}<br>
            ${distance_km ? `📍 <b>Masofa:</b> ${distance_km} km<br>` : ''}
            🆔 <b>ID:</b> ${id}
        </div>
    `;

    let photosHTML = '';
    if (photos && photos.length > 0) {
        photosHTML = `
          <div class="photos-gallery">
            <div class="photos-slider" data-total="${photos.length}">
              ${photos.map((p, i) => `<img src="${getPhotoUrl(p)}" data-index="${i}" loading="lazy"
              onerror="this.src='https://via.placeholder.com/300x200?text=Rasm+Yuklanmadi'">`).join('')}
            </div>
            <div class="dots-container">
              ${photos.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
            </div>
          </div>`;
    }

    return `
      <div class="listing-popup">
        <div class="listing-title">${escapeHtml(title)}</div>
        <div class="listing-price">${formatPrice(price)} ${listing.currency || "so'm"} / oy</div>
        ${descHTML}
        ${extraInfo}
        ${photosHTML}
        ${callButton}
        <button class="telegram-btn" onclick="saveListing(${id})">💾 E’lonni saqlash</button>
      </div>`;
}

// 📸 Slider va dot indikatorni initsializatsiya
function initPhotoSliders() {
  document.querySelectorAll(".photos-slider").forEach(slider => {
    const dots = slider.parentElement.querySelectorAll(".dot");
    const slideWidth = slider.clientWidth;

    let startX = 0, scrollStart = 0, isDragging = false;

    slider.addEventListener("touchstart", e => {
      isDragging = true;
      startX = e.touches[0].pageX;
      scrollStart = slider.scrollLeft;
    });

    slider.addEventListener("touchmove", e => {
      if (!isDragging) return;
      const moveX = e.touches[0].pageX - startX;
      slider.scrollLeft = scrollStart - moveX;
    });

    slider.addEventListener("touchend", () => {
      isDragging = false;
      const nearest = Math.round(slider.scrollLeft / slideWidth) * slideWidth;
      slider.scrollTo({ left: nearest, behavior: "smooth" });
      const index = Math.round(nearest / slideWidth);
      dots.forEach((d, i) => d.classList.toggle("active", i === index));
    });
  });
}

// 🔤 Yordamchi funksiyalar
function toggleDescription(id) {
    const desc = document.getElementById(`desc-${id}`);
    const btn = event.target;
    if (desc.classList.contains("expanded")) {
        desc.classList.remove("expanded");
        btn.textContent = "Batafsil…";
    } else {
        desc.classList.add("expanded");
        btn.textContent = "Yopish";
    }
}

function formatPrice(price) {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(price || 0));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function updateStats(count) {
    const statsElement = document.getElementById('stats');
    if (statsElement) statsElement.textContent = `Jami ${count} ta e'lon`;
}

function showLoading() { document.getElementById('loading')?.classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading')?.classList.add('hidden'); }
function showError() { document.getElementById('error')?.classList.remove('hidden'); }
function hideError() { document.getElementById('error')?.classList.add('hidden'); }

// 🧩 DOM yuklanganda ishga tushirish
document.addEventListener('DOMContentLoaded', () => {
    console.log("🌍 DOM yuklandi — xarita ishga tushmoqda...");
    initMap();
});

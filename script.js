document.addEventListener('DOMContentLoaded', function() {
    const presensiForm = document.getElementById('presensiForm');
    const feedbackDiv = document.getElementById('feedback');
    const laporanTable = document.getElementById('laporanTable');
    const photoInput = document.getElementById('photo');

    // Koordinat sekolah (SMK Negeri 10 Semarang)
    const schoolLat = -6.9664242;
    const schoolLong = 110.4020143; 
    const maxDistance = 3; // Jarak maksimal dalam kilometer (3 km)

    // Set default tanggal dan waktu
    setDefaultDateTime();

    // Simpan hash foto yang sudah diupload
    const uploadedPhotoHashes = new Set();

    function setDefaultDateTime() {
        const now = new Date();
        const localDate = now.toISOString().slice(0, 10);
        const localTime = now.toTimeString().slice(0, 5);

        document.getElementById('tanggal').value = localDate;
        document.getElementById('waktu').value = localTime;
    }

    function isWithinAttendanceHours(time) {
        const [hours, minutes] = time.split(':').map(Number);
        const timeInMinutes = hours * 60 + minutes;
        
        const startTime = 5 * 60; // 5:00 (5 * 60 minutes)
        const endTime = 24 * 60; // 24:00 (24 * 60 minutes)
        
        return timeInMinutes >= startTime && timeInMinutes <= endTime;
    }

    function getAttendanceStatus(time) {
        const [hours, minutes] = time.split(':').map(Number);
        const timeInMinutes = hours * 60 + minutes;
        
        const onTimeEndMinutes = 7 * 60 + 15; // 7:15 (7 * 60 + 15 minutes)
        
        return timeInMinutes <= onTimeEndMinutes ? 'Hadir' : 'Terlambat';
    }

    async function hashFile(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    presensiForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const nama = document.getElementById('nama').value.trim();
        const nis = document.getElementById('nis').value.trim();
        const kelas = document.getElementById('kelas').value;
        const tanggal = document.getElementById('tanggal').value;
        const waktu = document.getElementById('waktu').value;
        const photo = photoInput.files[0];

        // Validasi input kosong
        if (!nama || !nis || !kelas || !tanggal || !waktu || !photo) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Semua field harus diisi, termasuk foto.</p>`;
            return;
        }

        // Validasi format NIS (opsional, misal harus angka)
        if (!/^\d+$/.test(nis)) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">NIS harus berupa angka.</p>`;
            return;
        }

        // Validasi waktu absensi (5:00-24:00)
        if (!isWithinAttendanceHours(waktu)) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Absensi hanya dapat dilakukan antara pukul 05:00-24:00.</p>`;
            return;
        }

        // Validasi tanggal
        const currentDate = new Date();
        const inputDateTime = new Date(`${tanggal}T${waktu}`);
        const todayDate = new Date().toISOString().slice(0, 10);

        if (tanggal !== todayDate) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Tanggal yang dimasukkan harus sesuai dengan tanggal hari ini.</p>`;
            return;
        }

        // Validasi waktu (maksimum toleransi 5 menit sebelumnya hingga saat ini)
        const timeDifference = currentDate - inputDateTime;
        if (timeDifference < 0 || timeDifference > 5 * 60 * 1000) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Waktu yang dimasukkan tidak valid. Harap masukkan waktu yang sesuai dengan waktu saat ini.</p>`;
            return;
        }

        // Cek apakah foto sudah pernah diupload
        const photoHash = await hashFile(photo);
        if (uploadedPhotoHashes.has(photoHash)) {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Foto ini sudah pernah digunakan untuk presensi.</p>`;
            return;
        }

        // Cek lokasi website
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLong = position.coords.longitude;
                    const distance = getDistanceFromLatLonInKm(userLat, userLong, schoolLat, schoolLong);

                    if (distance <= maxDistance) {
                        const attendanceStatus = getAttendanceStatus(waktu);
                        
                        // Lokasi valid, lanjutkan dengan pengiriman
                        const formData = new FormData();
                        formData.append('nama', nama);
                        formData.append('nis', nis);
                        formData.append('kelas', kelas);
                        formData.append('tanggal', tanggal);
                        formData.append('waktu', waktu);
                        formData.append('status', attendanceStatus);
                        formData.append('photo', photo);

                        fetch('submit_presensi.php', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'success') {
                                uploadedPhotoHashes.add(photoHash);
                                submitPresensi(nama, nis, kelas, tanggal, waktu, attendanceStatus);
                            } else {
                                feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">${data.message}</p>`;
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Terjadi kesalahan saat mengirim data presensi.</p>`;
                        });
                    } else {
                        feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Anda berada di luar area sekolah (jarak: ${distance.toFixed(2)} km). Presensi gagal.</p>`;
                    }
                },
                (error) => {
                    console.error('Error:', error);
                    feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Tidak dapat memverifikasi lokasi Anda. Pastikan GPS diaktifkan dan izin lokasi diberikan.</p>`;
                }
            );
        } else {
            feedbackDiv.innerHTML = `<p style="color: red; font-weight: bold;">Browser Anda tidak mendukung geolokasi.</p>`;
        }
    });

    function submitPresensi(nama, nis, kelas, tanggal, waktu, status) {
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${nama}</td>
            <td>${nis}</td>
            <td>${kelas}</td>
            <td>${tanggal}</td>
            <td>${waktu}</td>
            <td>${status}</td>
        `;
        newRow.style.opacity = '0';
        laporanTable.prepend(newRow);

        // Animasi baris baru
        setTimeout(() => {
            newRow.style.transition = 'opacity 0.5s ease';
            newRow.style.opacity = '1';
        }, 10);

        const statusText = status === 'Hadir' ? 'tepat waktu' : 'terlambat';
        feedbackDiv.innerHTML = `
            <p style="color: green; font-weight: bold;">Terima kasih, ${nama} (${nis}) dari kelas ${kelas}, presensi Anda berhasil! Status: ${statusText}</p>
        `;

        presensiForm.reset();
        setDefaultDateTime();

        // Hapus feedback setelah 5 detik
        setTimeout(() => {
            feedbackDiv.innerHTML = '';
        }, 5000);
    }

    // Fungsi untuk menghitung jarak antara dua titik koordinat
    function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius bumi dalam km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Jarak dalam km
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
});






document.addEventListener('DOMContentLoaded', (event) => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme) {
        body.classList.add(currentTheme);
        if (currentTheme === 'dark-mode') {
            themeToggle.checked = true;
        }
    }

    // Toggle dark mode
    themeToggle.addEventListener('change', function() {
        if (this.checked) {
            body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark-mode');
        } else {
            body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light-mode');
        }
    });

    // Existing JavaScript code for form submission and report generation goes here
    // ...
});
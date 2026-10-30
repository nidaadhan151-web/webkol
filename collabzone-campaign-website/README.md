# CollabZone — Website campaign KOL & brand

Website statis berbasis HTML, CSS, dan JavaScript module. Tidak ada langkah build.

## Menjalankan website

1. Pada project Firebase `webkol`, aktifkan **Authentication (Email/Password)** dan **Cloud Firestore**.
2. Pastikan konfigurasi aplikasi web pada `firebase-config.js` cocok dengan Firebase Console. Nilai konfigurasi web bukan kredensial admin; jangan pernah memasukkan service-account key ke website.
3. Deploy `firestore.rules` ke Firestore Rules. Deploy ulang setiap kali file rules berubah; rules terbaru diperlukan untuk menyimpan profil, campaign, pengajuan top up, bukti transfer, notifikasi, dan saldo. `storage.rules` hanya diperlukan untuk file top up lama yang masih tersimpan di Cloud Storage.
4. Tambahkan domain website di Firebase Authentication → Settings → Authorized domains.
5. Jalankan `index.html` melalui server lokal seperti VS Code Live Server. Modul JavaScript Firebase tidak bisa berjalan dengan membuka file langsung melalui `file://`.

Jika seluruh konfigurasi Firebase masih kosong, website berjalan dalam mode demo `localStorage`. Mode tersebut hanya untuk uji coba lokal dan bukan autentikasi atau penyimpanan online.

Jika akun sudah terlihat di Firebase Authentication tetapi pendaftaran pernah gagal saat membuat profil Firestore, ulangi tab **Daftar** memakai email dan password yang sama. Website akan membuat profil hanya bila dokumen `users/{uid}` memang belum ada. Jika profil sudah ada, gunakan tab **Masuk**; jika Firestore menolak penulisan profil, deploy rules terbaru dan coba pemulihan lagi.

## Fitur Firebase

- Firebase Authentication untuk pendaftaran dan login akun KOL/brand.
- Cloud Firestore menyimpan profil tanpa password, campaign, pengajuan, dan notifikasi.
- KOL dapat mengubah nama lengkap dan foto profil, lalu mengisi link Instagram, TikTok, atau keduanya. Nomor WhatsApp opsional; foto baru tidak wajib dipilih saat menyimpan perubahan lain.
- Profil brand memiliki field terpisah untuk link Instagram, link TikTok, dan nomor telepon/WhatsApp.
- Dashboard KOL menampilkan progress verifikasi 5 tahap: foto profil, nama lengkap, minimal satu link Instagram/TikTok, satu pengajuan campaign Regular, dan persetujuan admin atas minimal satu link sosial. Tombol **Konfirmasi** di samping tiap link sosial mengirim permintaan pemeriksaan terpisah ke admin; Instagram saja atau TikTok saja sudah cukup. KOL dapat mengajukan campaign Regular kapan saja, termasuk saat profil belum lengkap; pengajuan Regular pertama tercatat sebagai tahap keempat, sedangkan persetujuan admin menjadi tahap kelima. Verifikasi 100% dan akses campaign Spesial baru terbuka setelah seluruh tahap selesai. Pengajuan Regular berikutnya juga dapat dikirim.
- Setelah memilih Campaign Spesial, brand memilih program sebelum form campaign terbuka. Admin dapat menambahkan program Campaign Spesial dari dashboard admin; program tersedia untuk brand secara langsung dan ditampilkan pada kartu campaign.
- Campaign Spesial memakai satu nilai CPM (Cost Per Mille), yaitu biaya per 1.000 tayangan. Brand tidak mengisi syarat campaign Spesial; admin mengelola syarat tersebut dari tabel **Syarat Campaign Spesial** di dashboard admin. Campaign lama yang belum memiliki CPM tetap ditampilkan dengan format paket fee dan jumlah video sebelumnya.
- Menu pengajuan brand ditampilkan sebagai **KOL Listing** dengan kategori **Belum ACC**, **ACC**, **Product Shipping**, **Draft Video**, dan **Payment**. Brand dapat memindahkan pengajuan secara berurutan: ACC, mulai Product Shipping, konfirmasi produk diterima untuk masuk ke Draft Video, lalu konfirmasi draft selesai untuk masuk ke Payment. Pengajuan yang ditolak tetap di kategori Belum ACC; perpindahan status dibatasi oleh Firestore Rules.
- Setelah pengajuan di-ACC, brand dan KOL mendapatkan tombol chat floating di kanan bawah dashboard. Percakapan dan pesan tersimpan realtime di Firestore, terhubung ke pengajuan/campaign terkait, dan hanya dapat diakses oleh brand pemilik serta KOL yang disetujui.
- KOL dapat meminta konfirmasi tautan Instagram atau TikTok setelah link tersebut disimpan, tanpa harus menyelesaikan tahap foto profil terlebih dahulu. Profil tetap dapat disimpan saat admin memeriksa tautan; hanya tautan yang sedang ditinjau yang tidak dapat diubah sampai keputusan admin diberikan. Permintaan verifikasi memunculkan notifikasi pada ikon lonceng admin; keputusan persetujuan atau penolakan memunculkan notifikasi pada ikon lonceng KOL. Mengubah tautan yang telah disetujui akan meminta KOL mengonfirmasi ulang.
- Notifikasi dibuka dari ikon lonceng sebagai dropdown, tanpa tab di sidebar. Admin menerima notifikasi saat KOL meminta verifikasi atau brand mengirim bukti top up; brand dan KOL menerima notifikasi saat admin meninjau pengajuan. Brand juga menerima notifikasi saat campaign dibuat atau KOL mengirim pengajuan. Notifikasi masuk diperbarui secara langsung selama sesi dashboard aktif.
- Pengajuan disimpan terpisah dari campaign agar data pribadi KOL tidak ikut terbuka ke publik.
- Banner JPG/PNG (maksimal 2 MB sebelum diproses) dikompres di browser menjadi JPEG maksimal sekitar 350 KB, lalu disimpan sebagai data banner di dokumen campaign Firestore. Ini menghindari Cloud Storage dan konfigurasi CORS, tetapi ukuran dokumen Firestore memiliki batas 1 MiB; batasi panjang deskripsi dan syarat campaign.
- Dashboard admin memisahkan ringkasan, pengguna, campaign, pengajuan, verifikasi KOL, dan program Campaign Spesial ke tab sidebar. Notifikasi tersedia dari ikon lonceng di bagian atas; tombol **Perbarui data** mengambil data terbaru dari Firestore.
- Brand dapat mengajukan top up Rp100.000 melalui transfer bank BNI ke rekening `40254652` dan mengunggah bukti JPG. Admin menerima notifikasi, memeriksa bukti, lalu menyetujui atau menolak pengajuan. Saldo hanya ditambahkan setelah persetujuan; membuat satu campaign memotong Rp100.000. ID pengajuan menampilkan ID otomatis diikuti nama brand.
- Bukti top up baru dikompres hingga maksimal 350 KB, lalu disimpan di dokumen privat Firestore terpisah dari metadata pengajuan. Hanya brand pemilik dan admin yang dapat membacanya; dashboard admin baru mengambil file saat bukti dibuka. Cara ini tidak membutuhkan bucket Storage atau konfigurasi CORS untuk unggahan baru.

## Mengaktifkan administrator

Pendaftaran publik hanya membuat akun KOL atau brand. Jangan menambahkan pilihan admin pada form pendaftaran. Buat akun admin melalui Firebase Authentication, kemudian berikan custom claim `admin: true` menggunakan Firebase Admin SDK dari lingkungan server tepercaya, bukan dari browser. Contoh Node.js yang dijalankan secara aman dengan Application Default Credentials:

```js
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });

const uid = "UID_AKUN_ADMIN";
const user = await getAuth().getUser(uid);
await getAuth().setCustomUserClaims(uid, { admin: true });
await getFirestore().doc(`users/${uid}`).set({
  uid,
  role: "admin",
  name: user.displayName || "Administrator",
  email: user.email,
  createdAt: Date.now()
});
```

Setelah claim diberikan, admin perlu keluar lalu masuk kembali agar token baru digunakan. Aturan akses admin memeriksa custom claim tersebut; mengubah UI atau dokumen profil saja tidak memberikan hak admin.

## Data lokal sebelumnya

Data demo yang tersimpan di `localStorage` tidak otomatis dipindahkan ke Firebase. Akun pada mode lokal juga bukan akun Firebase. Migrasi data lama perlu dilakukan terpisah dan ditinjau sebelum digunakan untuk data produksi.

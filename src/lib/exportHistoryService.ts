import { db, storage } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, startAfter, where, Timestamp, DocumentSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface ExportHistoryData {
  id?: string;
  tanggal: string; // YYYY-MM-DD
  waktu: string;   // HH:MM:SS atau HH.MM.SS
  timestamp: number;
  user: string;
  sizeMB: string;
  sizeKB: string;
  fileUrl: string;
  fileName: string;
}

export const saveExportHistory = async (
  blob: Blob,
  user: string,
  dateStr: string,
  timeStr: string,
  fileName: string
) => {
  try {
    console.log("Memulai proses simpan riwayat export...");
    // 1. Upload ke Firebase Storage
    const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storageRef = ref(storage, `export_history/${safeFileName}`);
    console.log("Mengunggah file ke Storage dengan ref:", storageRef.fullPath);
    await uploadBytes(storageRef, blob);
    console.log("Berhasil upload ke Storage. Mendapatkan URL...");
    const downloadUrl = await getDownloadURL(storageRef);
    console.log("URL didapat:", downloadUrl);

    // 2. Hitung ukuran
    const sizeInBytes = blob.size;
    const sizeKB = (sizeInBytes / 1024).toFixed(2);
    const sizeMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

    // 3. Simpan metadata ke Firestore
    const docData = {
      tanggal: dateStr,
      waktu: timeStr,
      timestamp: Date.now(),
      user: user || 'Unknown',
      sizeKB: `${sizeKB} KB`,
      sizeMB: `${sizeMB} MB`,
      fileUrl: downloadUrl,
      fileName: fileName,
      createdAt: Timestamp.now()
    };

    console.log("Menyimpan ke Firestore:", docData);
    const docRef = await addDoc(collection(db, 'export_history'), docData);
    console.log("Berhasil simpan ke Firestore dengan ID:", docRef.id);
    return { id: docRef.id, ...docData };
  } catch (error) {
    console.error("Error saving export history:", error);
    throw error; // Biarkan pemanggil tahu jika gagal
  }
};

export const getExportHistory = async (
  pageSize: number,
  lastDoc: DocumentSnapshot | null,
  startDate?: string,
  endDate?: string
) => {
  try {
    // Query ordered by timestamp desc without compound where clauses that require composite index
    const q = query(
      collection(db, 'export_history'),
      orderBy('timestamp', 'desc'),
      limit(startDate ? 300 : pageSize)
    );

    const snapshot = await getDocs(q);
    let rawData: ExportHistoryData[] = [];
    
    snapshot.forEach(doc => {
      rawData.push({ id: doc.id, ...doc.data() } as ExportHistoryData);
    });

    // Flexible Filter Function
    if (startDate) {
      const cleanStartDate = startDate.trim();

      // Check if item date matches or contains date filter
      rawData = rawData.filter(item => {
        const itemTanggal = (item.tanggal || '').trim();
        const itemCreatedDate = item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : '';
        const itemFormattedDate = item.timestamp ? new Date(item.timestamp).toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') : '';

        // Formats to match: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
        const parts = cleanStartDate.split('-');
        let indoStartDate = '';
        let dashIndoStartDate = '';
        if (parts.length === 3) {
          const [sy, sm, sd] = parts;
          indoStartDate = `${sd}/${sm}/${sy}`;
          dashIndoStartDate = `${sd}-${sm}-${sy}`;
        }

        const matchesTanggal = 
          itemTanggal.includes(cleanStartDate) ||
          (indoStartDate && itemTanggal.includes(indoStartDate)) ||
          (dashIndoStartDate && itemTanggal.includes(dashIndoStartDate));

        const matchesTimestamp = 
          itemCreatedDate === cleanStartDate ||
          (dashIndoStartDate && itemFormattedDate === dashIndoStartDate);

        return matchesTanggal || matchesTimestamp;
      });
    }

    const paginatedData = startDate ? rawData.slice(0, pageSize) : rawData;
    const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { 
      data: paginatedData, 
      lastDoc: newLastDoc, 
      hasMore: startDate ? rawData.length > pageSize : snapshot.docs.length === pageSize,
      firstDoc: snapshot.docs.length > 0 ? snapshot.docs[0] : null
    };
  } catch (error) {
    console.error("Error getting export history:", error);
    return { data: [], lastDoc: null, hasMore: false, firstDoc: null };
  }
};

export const deleteExportHistory = async (items: { id: string, fileUrl: string }[]) => {
  try {
    const { deleteDoc, doc } = await import('firebase/firestore');
    const { deleteObject, ref } = await import('firebase/storage');
    
    let deletedCount = 0;
    
    for (const item of items) {
      if (item.id) {
        // 1. Hapus dari Firestore
        await deleteDoc(doc(db, 'export_history', item.id));
        
        // 2. Hapus dari Storage (menggunakan URL untuk mendapatkan referensi file)
        try {
          if (item.fileUrl) {
            const fileRef = ref(storage, item.fileUrl);
            await deleteObject(fileRef);
          }
        } catch (storageError) {
          console.warn("Gagal menghapus file dari Storage (mungkin sudah terhapus):", storageError);
        }
        
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error("Error deleting export history:", error);
    throw error;
  }
};

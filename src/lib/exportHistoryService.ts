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
    let q = query(collection(db, 'export_history'), orderBy('timestamp', 'desc'));

    // Filter tanggal spesifik
    if (startDate && startDate === endDate) {
      q = query(collection(db, 'export_history'), where('tanggal', '==', startDate), orderBy('timestamp', 'desc'));
    } else if (startDate && endDate) {
      q = query(collection(db, 'export_history'), where('tanggal', '>=', startDate), where('tanggal', '<=', endDate), orderBy('timestamp', 'desc'));
    }

    q = query(q, limit(pageSize));

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const data: ExportHistoryData[] = [];
    
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() } as ExportHistoryData);
    });

    const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { 
      data, 
      lastDoc: newLastDoc, 
      hasMore: snapshot.docs.length === pageSize,
      firstDoc: snapshot.docs.length > 0 ? snapshot.docs[0] : null
    };
  } catch (error) {
    console.error("Error getting export history:", error);
    throw error;
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

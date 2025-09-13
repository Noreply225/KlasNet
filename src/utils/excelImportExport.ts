import { Eleve } from '../types';
import * as XLSX from 'xlsx';

// Importer les élèves depuis un fichier Excel (xlsx ou xls) en utilisant SheetJS (xlsx)
export async function importerElevesDepuisExcel(file: File, mapping?: {
  matricule?: string;
  nom?: string;
  prenoms?: string;
  nomPrenoms?: string;
  moyenne?: string;
}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer | string;
        const workbook = XLSX.read(data, { type: typeof data === 'string' ? 'binary' : 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!rows || rows.length === 0) {
          reject('Fichier Excel vide ou illisible');
          return;
        }

        const header = (rows[0] as any[]).map((h: any) => String(h || '').trim());
        const body = rows.slice(1) as any[][];

        if (!mapping) {
          resolve({ columns: header, preview: body.slice(0, 5) });
          return;
        }

        const matriculeIdx = mapping.matricule ? header.findIndex((h: string) => h === mapping.matricule) : -1;
        const nomIdx = mapping.nom ? header.findIndex((h: string) => h === mapping.nom) : -1;
        const prenomsIdx = mapping.prenoms ? header.findIndex((h: string) => h === mapping.prenoms) : -1;
        const nomPrenomsIdx = mapping.nomPrenoms ? header.findIndex((h: string) => h === mapping.nomPrenoms) : -1;

        if (matriculeIdx === -1) {
          reject('Colonne "Matricule" non trouvée.');
          return;
        }

        const eleves: Eleve[] = body.map((row: any[]) => {
          let nom = '';
          let prenoms = '';
          if (nomPrenomsIdx !== -1) {
            const full = String(row[nomPrenomsIdx] || '').trim();
            const parts = full.split(' ');
            nom = parts[0] || '';
            prenoms = parts.slice(1).join(' ');
          } else {
            nom = nomIdx !== -1 ? String(row[nomIdx] || '').trim() : '';
            prenoms = prenomsIdx !== -1 ? String(row[prenomsIdx] || '').trim() : '';
          }
          return {
            id: '',
            matricule: String(row[matriculeIdx] || '').trim(),
            nom,
            prenoms,
            sexe: 'M',
            dateNaissance: '',
            lieuNaissance: '',
            classeId: '',
            anneeEntree: new Date().getFullYear().toString(),
            statut: 'Actif',
            pereTuteur: '',
            mereTutrice: '',
            telephone: '',
            adresse: '',
            photo: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Eleve;
        });

        resolve(eleves);
      } catch (err) {
        reject(err instanceof Error ? err.message : String(err));
      }
    };
    reader.onerror = () => reject('Erreur lecture du fichier');
    reader.readAsArrayBuffer(file);
  });
}

// Exporter les élèves au format Excel (xlsx) en utilisant SheetJS
export async function exporterElevesEnExcel(eleves: Eleve[]) {
  const wsData = [
    ['Matricule', 'Nom && Prénoms', 'Moyenne'],
    ...eleves.map(e => [e.matricule, `${e.nom} ${e.prenoms}`, ''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Élèves');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return wbout as ArrayBuffer;
}

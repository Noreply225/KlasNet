import React, { useRef, useMemo } from 'react';
import EnteteFiche from '../EnteteFiche';
import { getEnteteConfig } from '../../utils/entetesConfig';
import { openPrintPreviewFromElementId } from '../../utils/printPreview';
import { db } from '../../utils/database';
import { echeancesManager } from '../../utils/echeancesManager';

interface RecuPaiementProps {
  eleve: {
    nom: string;
    prenoms: string;
    matricule: string;
    classe: string;
    id?: string;
  };
  montantRegle: number;
  date: string;
  mode: string;
  cumulReglement: number;
  resteAPayer: number;
  anneeScolaire: string;
  operateur: string;
  numeroRecu: string;
  logoUrl?: string;
  printMode?: boolean;
}

const formatMontant = (m: number) => m.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' FCFA';
const formatDate = (d: string) => {
  const dateObj = new Date(d);
  return isNaN(dateObj.getTime()) ? d : dateObj.toLocaleDateString('fr-FR');
};

const RecuPaiement: React.FC<RecuPaiementProps> = ({
  eleve,
  montantRegle,
  date,
  mode,
  cumulReglement,
  resteAPayer,
  anneeScolaire,
  operateur,
  numeroRecu,
  logoUrl,
  printMode = false
}) => {
  // Récupérer les données complètes de l'élève
  const eleveFull = useMemo(() => {
    if (!eleve.id) return null;
    try {
      return db.getById<any>('eleves', eleve.id) || null;
    } catch (err) {
      console.warn('RecuPaiement: unable to load eleve full data', err);
      return null;
    }
  }, [eleve.id]);

  // Récupérer la situation des échéances
  const situation = useMemo(() => {
    if (!eleve.id) return null;
    try {
      return echeancesManager.getSituationEcheances(eleve.id) || null;
    } catch (err) {
      console.warn('RecuPaiement: unable to load situation', err);
      return null;
    }
  }, [eleve.id]);

  // Calculer les totaux corrects
  const totals = useMemo(() => {
    let totalAttendu = 0;
    let cumulReel = cumulReglement || 0;
    let resteReel = resteAPayer || 0;

    if (situation) {
      // Utiliser les données de la situation pour avoir les vrais totaux
      if (situation.eleve?.protege) {
        // Pour les protégés, seule l'inscription compte
        const ins = (situation.echeances || []).filter((e: any) => e.modalite === 1);
        totalAttendu = ins.reduce((s: number, e: any) => s + (e.montant || 0), 0);
        cumulReel = ins.reduce((s: number, e: any) => s + (e.montantPaye || 0), 0);
        resteReel = ins.reduce((s: number, e: any) => s + (e.montantRestant || 0), 0);
      } else {
        totalAttendu = situation.totalDu || 0;
        cumulReel = situation.totalPaye || 0;
        resteReel = situation.totalRestant || 0;
      }
    }

    return { totalAttendu, cumulReel, resteReel };
  }, [situation, cumulReglement, resteAPayer]);

  // Trouver la prochaine échéance
  const prochaine = useMemo(() => {
    if (!situation || !situation.echeances) return null;
    const next = situation.echeances.find((e: any) => (e.montantRestant || 0) > 0 && !e.isEchue);
    if (!next) return null;
    return {
      label: next.label || (next.modalite === 1 ? 'Inscription' : `Versement ${next.modalite}`),
      date: next.date || '',
      montant: next.montantRestant || 0
    };
  }, [situation]);

  // Récupérer les détails du paiement actuel
  const detailsPaiement = useMemo(() => {
    if (!eleve.id) return null;
    try {
      const paiements = db.getAll<any>('paiements').filter((p: any) => p.eleveId === eleve.id && !p.canceled);
      const paiement = paiements.find((p: any) => (p.numeroRecu || '').toString() === (numeroRecu || '').toString()) || 
                     paiements.sort((a: any, b: any) => new Date(b.datePaiement || b.createdAt).getTime() - new Date(a.datePaiement || a.createdAt).getTime())[0];
      
      if (paiement && paiement.allocations && paiement.allocations.length > 0) {
        return paiement.allocations.map((alloc: any) => {
          let label = 'Modalité inconnue';
          let attendu = 0;
          let resteModalite = 0;
          
          if (situation && situation.echeances) {
            const ech = situation.echeances.find((e: any) => e.echeanceId === alloc.echeanceId);
            if (ech) {
              label = ech.label || (ech.modalite === 1 ? 'Inscription' : `Versement ${ech.modalite}`);
              attendu = ech.montant || 0;
              resteModalite = Math.max(0, (ech.montant || 0) - (alloc.montant || 0));
            }
          }
          
          return {
            label,
            montantRegle: alloc.montant || 0,
            attendu,
            reste: resteModalite,
            dateHeure: paiement.datePaiement || paiement.createdAt || date
          };
        });
      }
      
      // Fallback si pas d'allocations
      return [{
        label: 'Inscription',
        montantRegle: montantRegle,
        attendu: totals.totalAttendu,
        reste: Math.max(0, totals.totalAttendu - montantRegle),
        dateHeure: date
      }];
    } catch (err) {
      return [{
        label: 'Inscription',
        montantRegle: montantRegle,
        attendu: totals.totalAttendu,
        reste: Math.max(0, totals.totalAttendu - montantRegle),
        dateHeure: date
      }];
    }
  }, [eleve.id, numeroRecu, situation, montantRegle, totals.totalAttendu, date]);

  const cfg = getEnteteConfig('recu');
  const printRef = useRef<HTMLDivElement | null>(null);

  const handlePdfPreview = (twoPerPage = false) => {
    const id = `recu-print-area-${numeroRecu}`;
    if (!printRef.current) return;
    if (!printRef.current.id) printRef.current.id = id;
    
    if (twoPerPage) {
      printRef.current.classList.add('print-two-per-page');
      printRef.current.setAttribute('data-print-two-up', '1');
    }
    openPrintPreviewFromElementId(id, `Reçu ${numeroRecu}`);
    if (twoPerPage) {
      setTimeout(() => {
        if (printRef.current) {
          printRef.current.classList.remove('print-two-per-page');
          printRef.current.removeAttribute('data-print-two-up');
        }
      }, 500);
    }
  };

  return (
    <div
      ref={printRef}
      className={`${printMode ? '' : 'bg-white p-4 rounded-md shadow-sm max-w-lg mx-auto border border-gray-200 print:max-w-full print:shadow-none print:border-0 font-sans receipt-compact print-compact'} print:page-break-after-always mb-8`}
    >
      {printMode ? (
        <div id="print-area" className="print:block">
          <EnteteFiche type="recu" libelle="REÇU DE PAIEMENT" />
        </div>
      ) : (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {(cfg.logo || logoUrl) ? (
              <img src={cfg.logo || logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
            ) : (
              <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">Logo</div>
            )}
            <div className="text-sm text-gray-700 font-semibold leading-tight">
              <div className="font-bold">GROUPE SCOLAIRE BAPTISTE MISSIONNAIRE DE KOUMASSI CENTRE</div>
              <div className="text-xs text-gray-500 mt-1">Année scolaire : <span className="font-bold">{anneeScolaire}</span></div>
            </div>
          </div>
          <div className="text-sm text-gray-600 text-right">
            <div className="font-bold">N° Reçu : <span className="text-black">{numeroRecu}</span></div>
            <div>Date : {formatDate(date)}</div>
          </div>
        </div>
      )}

      {!printMode && (
        <div className="flex justify-end mb-4 space-x-2">
          <button 
            type="button" 
            onClick={() => handlePdfPreview(false)} 
            className="inline-flex items-center px-3 py-1 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded"
          >
            Aperçu PDF
          </button>
          <button 
            type="button" 
            onClick={() => handlePdfPreview(true)} 
            title="Imprimer 2 reçus par page" 
            className="inline-flex items-center px-3 py-1 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded"
          >
            Aperçu (2 par page)
          </button>
        </div>
      )}

      <h2 className="text-lg font-extrabold text-center mb-4 mt-2 tracking-wide text-teal-700">REÇU DE PAIEMENT</h2>
      
      {/* Informations élève */}
      <div className="mb-4 text-sm text-gray-700 grid grid-cols-2 gap-x-4 gap-y-2">
        <div><span className="font-bold">Élève :</span> <span className="font-semibold">{eleve.prenoms} {eleve.nom}</span></div>
        <div><span className="font-bold">Matricule :</span> <span className="font-semibold">{eleve.matricule}</span></div>
        <div><span className="font-bold">Classe :</span> <span className="font-semibold">{eleve.classe}</span></div>
        <div><span className="font-bold">Opérateur :</span> <span className="font-semibold">{operateur}</span></div>
      </div>

      {/* Tableau des modalités */}
      <table className="w-full text-sm border border-gray-200 mb-4 rounded overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-gray-700">
            <th className="border px-2 py-2 text-left font-semibold">Modalité</th>
            <th className="border px-2 py-2 text-right font-semibold">Montant réglé</th>
            <th className="border px-2 py-2 text-right font-semibold">Montant attendu</th>
            <th className="border px-2 py-2 text-right font-semibold">Reste</th>
            <th className="border px-2 py-2 text-right font-semibold">Date / Heure</th>
          </tr>
        </thead>
        <tbody>
          {detailsPaiement && detailsPaiement.map((detail, idx) => (
            <tr key={idx} className="text-center">
              <td className="border px-2 py-2 font-semibold text-left">{detail.label}</td>
              <td className="border px-2 py-2 text-right font-extrabold text-teal-700">{formatMontant(detail.montantRegle)}</td>
              <td className="border px-2 py-2 text-right">{formatMontant(detail.attendu)}</td>
              <td className="border px-2 py-2 text-right font-extrabold text-red-600">{formatMontant(detail.reste)}</td>
              <td className="border px-2 py-2 text-right">{new Date(detail.dateHeure).toLocaleString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Résumé financier */}
      <div className="text-sm mb-4 border-t pt-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Montant réglé (aujourd'hui) :</span>
            <span className="font-bold">{formatMontant(montantRegle)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cumul réglé :</span>
            <span className="font-semibold">{formatMontant(totals.cumulReel)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total attendu :</span>
            <span className="font-semibold">{formatMontant(totals.totalAttendu)}</span>
          </div>
          <div className="flex justify-between">
            <span>Reste à payer :</span>
            <span className="font-bold text-red-600">{formatMontant(totals.resteReel)}</span>
          </div>
          
          {prochaine && prochaine.montant > 0 && (
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-semibold">Prochain paiement :</span>
              <span className="font-bold">{formatMontant(prochaine.montant)}</span>
            </div>
          )}
          
          {prochaine && prochaine.montant > 0 && (
            <div className="text-xs text-gray-600">
              {prochaine.label}{prochaine.date ? `, échéance : ${formatDate(prochaine.date)}` : ''}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            Mode: {mode} • Imprimé le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
          </div>
          <div className="text-sm font-semibold text-teal-700">
            Merci pour ce paiement.
          </div>
        </div>
      </div>

      {/* Ligne de séparation pour l'impression */}
      <hr className="my-8 border-t-2 border-gray-300 print:page-break-after-always" />
    </div>
  );
};

export default RecuPaiement;
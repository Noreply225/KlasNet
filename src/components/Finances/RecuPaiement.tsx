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
  logoUrl
  , printMode = false
}) => {
  // compute derived data with useMemo to avoid repeated work and reduce try/catch scope
  const eleveFull = useMemo(() => {
    if (!eleve.id) return null;
    try {
      return db.getById<any>('eleves', eleve.id) || null;
    } catch (err) {
      // keep warnings minimal; component should not crash on read errors
      console.warn('RecuPaiement: unable to load eleve full data', err);
      return null;
    }
  }, [eleve.id]);

  const situation = useMemo(() => {
    if (!eleve.id) return null;
    try {
      return echeancesManager.getSituationEcheances(eleve.id) || null;
    } catch (err) {
      console.warn('RecuPaiement: unable to load situation', err);
      return null;
    }
  }, [eleve.id]);

  const parentsText = useMemo(() => {
    if (!eleveFull) return '';
    return `P: ${eleveFull.pereTuteur || ''} • M: ${eleveFull.mereTutrice || ''}`.trim();
  }, [eleveFull]);

  const garantText = useMemo(() => {
    if (!eleveFull) return '';
    if (eleveFull.protege && eleveFull.garantId) {
      try {
        const g = db.getById<any>('enseignants', eleveFull.garantId);
        return g ? `${g.prenoms || ''} ${g.nom || ''}`.trim() : '';
      } catch (err) {
        return '';
      }
    }
    return '';
  }, [eleveFull]);

  const totals = useMemo(() => {
    // start with provided props, but fall back to situation-derived values when zero/undefined
    let cumul = (cumulReglement || 0);
    let reste = (resteAPayer || 0);
    if (situation) {
      if (!cumul) {
        if (situation.eleve?.protege) {
          const ins = (situation.echeances || []).filter((e: any) => e.modalite === 1);
          cumul = ins.reduce((s: number, e: any) => s + (e.montantPaye || 0), 0);
        } else {
          cumul = situation.totalPaye || 0;
        }
      }
      if (!reste) {
        if (situation.eleve?.protege) {
          const ins = (situation.echeances || []).filter((e: any) => e.modalite === 1);
          reste = ins.reduce((s: number, e: any) => s + (e.montantRestant || 0), 0);
        } else {
          reste = situation.totalRestant || 0;
        }
      }
    }
    return { cumul, reste };
  }, [cumulReglement, resteAPayer, situation]);

  const prochaine = useMemo(() => {
    if (!situation || !situation.echeances) return null;
    const next = situation.echeances.find((e: any) => (e.montantRestant || 0) > 0) || null;
    if (!next) return null;
    return {
      label: next.label || (next.modalite === 1 ? 'Inscription' : `Versement ${next.modalite}`),
      date: next.date || '',
      montant: next.montant || next.montantRestant || 0
    };
  }, [situation]);
  const cfg = getEnteteConfig('recu');
  const printRef = useRef<HTMLDivElement | null>(null);

  const handlePdfPreview = (twoPerPage = false) => {
    const id = `recu-print-area-${numeroRecu}`;
    if (!printRef.current) return;
    if (!printRef.current.id) printRef.current.id = id;
    // add helper class on the element so print styles can pick it up
    if (twoPerPage) {
      printRef.current.classList.add('print-two-per-page');
      printRef.current.setAttribute('data-print-two-up', '1');
    }
    openPrintPreviewFromElementId(id, `Reçu ${numeroRecu}`);
    if (twoPerPage) setTimeout(() => printRef.current && (printRef.current.classList.remove('print-two-per-page'), printRef.current.removeAttribute('data-print-two-up')), 500);
  };
  return (
    // Ajout d'un saut de page à l'impression et marge plus grande entre reçus
    <div
      ref={printRef}
      className={`${printMode ? '' : 'bg-white p-4 rounded-md shadow-sm max-w-lg mx-auto border border-gray-200 print:max-w-full print:shadow-none print:border-0 font-sans receipt-compact print-compact'} print:page-break-after-always mb-8`}
    >
      {printMode ? (
        <div id="print-area" className="print:block">
          {/* EnteteFiche already renders logos/libelle/footer for print */}
          <EnteteFiche type="recu" libelle="REÇU DE PAIEMENT" />
        </div>
      ) : (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            {(cfg.logo || logoUrl) ? (
              <img src={cfg.logo || logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
            ) : (
              <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">Logo</div>
            )}
            <div className="text-xs text-gray-700 font-semibold leading-tight">
              <div>GROUPE SCOLAIRE BAPTISTE MISSIONNAIRE DE KOUMASSI CENTRE</div>
              <div className="text-[11px] text-gray-500">Année scolaire : <span className="font-bold">{anneeScolaire}</span></div>
            </div>
          </div>
          <div className="text-xs text-gray-600 text-right">
            <div className="font-bold">N° Reçu : <span className="text-black">{numeroRecu}</span></div>
            <div>Date : {formatDate(date)}</div>
          </div>
        </div>
      )}
      {!printMode && (
        <div className="flex justify-end mb-2 space-x-2">
          <button type="button" onClick={() => handlePdfPreview(false)} className="inline-flex items-center px-3 py-1 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded">
            Aperçu PDF
          </button>
          <button type="button" onClick={() => handlePdfPreview(true)} title="Imprimer 2 reçus par page" className="inline-flex items-center px-3 py-1 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded">
            Aperçu (2 par page)
          </button>
        </div>
      )}
      <h2 className="text-lg font-extrabold text-center mb-1 mt-1 tracking-wide text-teal-700">REÇU DE PAIEMENT</h2>
      <div className="mb-3 text-sm text-gray-700 grid grid-cols-2 gap-x-3 gap-y-1">
        <div><span className="font-bold">Élève :</span> <span className="font-semibold">{eleve.nom} {eleve.prenoms}</span></div>
        <div><span className="font-bold">Matricule :</span> <span className="font-semibold">{eleve.matricule}</span></div>
        <div><span className="font-bold">Classe :</span> <span className="font-semibold">{eleve.classe}</span></div>
        <div><span className="font-bold">Opérateur :</span> <span className="font-semibold">{operateur}</span></div>
      </div>
          <table className="w-full text-sm border border-gray-200 mb-3 rounded overflow-hidden">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="border px-2 py-1 text-left">Modalité</th>
                <th className="border px-2 py-1 text-right">Montant réglé</th>
                <th className="border px-2 py-1 text-right">Montant attendu</th>
                <th className="border px-2 py-1 text-right">Reste</th>
                <th className="border px-2 py-1 text-right">Date / Heure</th>
              </tr>
            </thead>
            <tbody>
              {
                (() => {
                  try {
                    if (!eleve.id) throw new Error('no eleve id');
                    const situation = echeancesManager.getSituationEcheances(eleve.id);
                    const paiements = db.getAll<any>('paiements').filter((p: any) => p.eleveId === eleve.id && !p.canceled);
                    const paiement = paiements.find((p: any) => (p.numeroRecu || '').toString() === (numeroRecu || '').toString()) || paiements.sort((a: any,b: any)=>new Date(b.datePaiement||b.createdAt).getTime()-new Date(a.datePaiement||a.createdAt).getTime())[0];
                    if (paiement && paiement.allocations && paiement.allocations.length>0) {
                      return paiement.allocations.map((alloc: any, idx: number) => {
                        let label = '';
                        let attendu = 0;
                        let resteModalite = 0;
                        if (situation && situation.echeances) {
                          const ech = situation.echeances.find((e: any) => e.echeanceId === alloc.echeanceId || e.modalite === alloc.modalite);
                          if (ech) {
                            label = ech.label || (ech.modalite === 1 ? 'Inscription' : `Versement ${ech.modalite}`);
                            attendu = ech.montant || 0;
                            // Le reste affiché ici doit être le reste de la modalité, pas le reste global
                            resteModalite = Math.max(0, attendu - (alloc.montant || 0));
                          }
                        }
                        if (!label && alloc && alloc.modalite === 1) label = 'Inscription';
                        if (!label && alloc && alloc.modalite > 1) label = `Versement ${alloc.modalite}`;
                        const dateStr = paiement.datePaiement || paiement.createdAt || date;
                        return (
                          <tr key={idx} className="text-center">
                            <td className="border px-2 py-1 font-semibold text-left">{label}</td>
                            <td className="border px-2 py-1 text-right font-extrabold text-teal-700">{Number(alloc.montant||0).toLocaleString('fr-FR')} FCFA</td>
                            <td className="border px-2 py-1 text-right">{Number(attendu||0).toLocaleString('fr-FR')} FCFA</td>
                            <td className="border px-2 py-1 text-right font-extrabold text-red-600">{Number(resteModalite||0).toLocaleString('fr-FR')} FCFA</td>
                            <td className="border px-2 py-1 text-right">{new Date(dateStr).toLocaleString('fr-FR')}</td>
                          </tr>
                        );
                      });
                    }
                  } catch(e) {}
                  return (
                    <tr className="text-center">
                      <td className="border px-2 py-1 font-semibold text-left">{'Inscription'}</td>
                      <td className="border px-2 py-1 text-right font-extrabold text-teal-700">{Number(montantRegle||0).toLocaleString('fr-FR')} FCFA</td>
                      <td className="border px-2 py-1 text-right">{Number(totals.cumul||0).toLocaleString('fr-FR')} FCFA</td>
                      <td className="border px-2 py-1 text-right font-extrabold text-red-600">{Number(totals.reste||0).toLocaleString('fr-FR')} FCFA</td>
                      <td className="border px-2 py-1 text-right">{new Date(date).toLocaleString('fr-FR')}</td>
                    </tr>
                  );
                })()
              }
            </tbody>
          </table>
          {/* Footer summary rendu comme un tableau compact sous le tableau principal */}
          <div className="text-sm mb-2 border-t pt-2">
            <table className="w-full text-sm footer-table" style={{borderCollapse: 'separate', borderSpacing: '8px 6px'}} aria-label="Résumé paiement">
              <tbody>
                <tr>
                  <td style={{width: '60%', padding: '6px 8px'}}>Montant réglé (aujourd'hui) :</td>
                  <td className="text-right font-bold" style={{padding: '6px 8px'}}>{formatMontant(montantRegle)}</td>
                </tr>
                <tr>
                  <td style={{padding: '6px 8px'}}>Cumul réglé :</td>
                  <td className="text-right" style={{padding: '6px 8px'}}>{formatMontant(totals.cumul)}</td>
                </tr>
                <tr>
                  <td style={{padding: '6px 8px'}}>Total attendu :</td>
                  <td className="text-right" style={{padding: '6px 8px'}}>{formatMontant(situation?.totalDu || 0)}</td>
                </tr>
                <tr>
                  <td style={{padding: '6px 8px'}}>Reste à payer :</td>
                  <td className="text-right font-bold text-red-600" style={{padding: '6px 8px'}}>{formatMontant(totals.reste)}</td>
                </tr>
                {prochaine && (
                  <tr>
                    <td style={{padding: '6px 8px'}}><span className="font-semibold">Prochain paiement :</span> {prochaine.label}{prochaine.date ? `, échéance : ${formatDate(prochaine.date)}` : ''}</td>
                    <td className="text-right font-bold" style={{padding: '6px 8px'}}>{formatMontant(prochaine.montant || 0)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} className="text-right pt-2" style={{paddingTop: '8px'}}><span className="text-sm font-semibold text-teal-700">Merci pour ce paiement.</span></td>
                </tr>
              </tbody>
            </table>
          </div>
      {/* Ligne de séparation visuelle */}
      <hr className="my-8 border-t-2 border-gray-300 print:page-break-after-always" />
      {/* removed duplicate printed timestamp block - refund note shown in footer above */}
    </div>
  );
};

export default RecuPaiement;


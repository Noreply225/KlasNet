import EnteteFiche from '../EnteteFiche';
import { db } from '../../utils/database';
import { getCurrentUser } from '../../utils/auth';
import { openPrintPreviewFromElementId } from '../../utils/printPreview';
import Button from '../UI/Button';

interface CombinedRecuProps {
  eleve: any;
  paiements: any[];
  classe?: any;
  anneeScolaire?: string;
  operateur?: string;
}

export default function CombinedRecu({ eleve, paiements, classe, anneeScolaire, operateur }: CombinedRecuProps) {
  const total = (paiements || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const numero = 'REC' + Date.now().toString().slice(-8);
  
  // compute total attendu from fraisScolaires for the classe/annee
  let totalAttendu = 0;
  if (classe) {
    const frais = db.getAll<any>('fraisScolaires').find((f: any) => f.niveau === classe.niveau && f.anneeScolaire === classe.anneeScolaire);
    if (frais && frais.echeances && frais.echeances.length) {
      totalAttendu = (frais.echeances || []).reduce((s: number, e: any) => s + Number(e.montant || 0), 0);
    }
  }
  const reste = Math.max(0, totalAttendu - total);
  
  // build echeance lookup and compute totals per echeance from allocations
  let echeances: any[] = [];
  const echeanceMap: Record<string, any> = {};
  const payéParEcheance: Record<string, number> = {};
  if (classe) {
    const frais = db.getAll<any>('fraisScolaires').find((f: any) => f.niveau === classe.niveau && f.anneeScolaire === classe.anneeScolaire);
    if (frais && frais.echeances && frais.echeances.length) {
      echeances = (frais.echeances || []).slice();
      for (const e of echeances) {
        const id = e.id || `${frais.niveau}-${(e.modalite || 0)}`;
        echeanceMap[id] = e;
        payéParEcheance[id] = 0;
      }
    }
  }
  
  // aggregate allocations from paiements and group by modality for compact display
  for (const p of (paiements || [])) {
    const allocs = (p && p.allocations) || [];
    if (allocs && Array.isArray(allocs) && allocs.length) {
      for (const a of allocs) {
        const id = a.echeanceId;
        payéParEcheance[id] = (payéParEcheance[id] || 0) + Number(a.montant || 0);
      }
    } else {
      const anyP: any = p as any;
      let attributedEid: string | null = null;

      if (typeof anyP.modalite !== 'undefined' && anyP.modalite !== null) {
        const modalNum = Number(anyP.modalite);
        const e = echeances.find((ee: any) => Number(ee.modalite) === modalNum);
        if (e) attributedEid = e.id || `${classe.niveau}-${e.modalite}`;
      }

      if (!attributedEid) {
        if (anyP.typeFrais === 'inscription') {
          const e1 = echeances.find((ee: any) => Number(ee.modalite) === 1);
          if (e1) attributedEid = e1.id || `${classe.niveau}-${e1.modalite}`;
        } else if (anyP.typeFrais === 'scolarite' && typeof anyP.versementIndex !== 'undefined') {
          const modal = Number(anyP.versementIndex) + 1;
          const e = echeances.find((ee: any) => Number(ee.modalite) === modal);
          if (e) attributedEid = e.id || `${classe.niveau}-${e.modalite}`;
        }
      }

      if (!attributedEid) {
        const montantP = Number(anyP.montant || 0);
        const cand = echeances.find((ee: any) => Number(ee.montant || 0) === montantP && ((payéParEcheance[ee.id || `${classe.niveau}-${ee.modalite}`] || 0) < Number(ee.montant || 0)));
        if (cand) attributedEid = cand.id || `${classe.niveau}-${cand.modalite}`;
      }

      if (attributedEid) {
        payéParEcheance[attributedEid] = (payéParEcheance[attributedEid] || 0) + Number(anyP.montant || 0);
      }
    }
  }
  
  return (
    <div className="p-4 print-compact receipt-compact" id="combined-recu-print-area" style={{ pageBreakAfter: 'always' }}>
      <EnteteFiche type="recu" libelle={`Reçu combiné — ${anneeScolaire || ''}`} />
      <div className="flex justify-end mb-2 space-x-2">
        <Button variant="primary" className="text-sm" onClick={() => {
            const el = document.getElementById('combined-recu-print-area');
            if (!el) return;
            if (el.classList.contains('print-two-per-page')) el.classList.remove('print-two-per-page');
            openPrintPreviewFromElementId('combined-recu-print-area', `recu_combine_${eleve.matricule || 'unknown'}`);
          }}>
          Exporter PDF
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => {
            const el = document.getElementById('combined-recu-print-area');
            if (!el) return;
            el.classList.add('print-two-per-page');
            openPrintPreviewFromElementId('combined-recu-print-area', `recu_combine_${eleve.matricule || 'unknown'}_2up`);
            setTimeout(() => el.classList.remove('print-two-per-page'), 500);
          }}>
          Exporter (2/pg)
        </Button>
      </div>
      <div className="mt-2 mb-4 compact-meta text-sm">
        <div className="flex justify-between">
          <div><strong>Élève:</strong> {eleve.prenoms} {eleve.nom}</div>
          <div><strong>N° Reçu:</strong> {numero}</div>
        </div>
        <div className="flex justify-between">
          <div><strong>Classe:</strong> {classe ? `${classe.niveau} ${classe.section || ''}` : ''}</div>
          <div><strong>Matricule:</strong> {eleve.matricule || ''}</div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Détails des opérations</h4>
        <table className="w-full text-sm border-collapse compact-table">
          <thead>
            <tr>
              <th className="border px-2 py-1">Date</th>
              <th className="border px-2 py-1">Type</th>
              <th className="border px-2 py-1">Montant</th>
              <th className="border px-2 py-1">Affectation</th>
            </tr>
          </thead>
          <tbody>
            {paiements.map((p, i) => (
              <tr key={i}>
                <td className="border px-2 py-1">{new Date(p.datePaiement || p.date || Date.now()).toLocaleDateString('fr-FR')}</td>
                <td className="border px-2 py-1">{p.typeFrais || '-'}</td>
                <td className="border px-2 py-1 text-right">{(Number(p.montant) || 0).toLocaleString('fr-FR')} FCFA</td>
                <td className="border px-2 py-1 text-sm">
                  {((p && (p as any).allocations) || []).length ? (
                    <div className="flex flex-col">
                      {((p as any).allocations || []).map((a: any, idx: number) => {
                        const eid = a.echeanceId;
                        const ech = echeanceMap[eid] || null;
                        const label = ech ? (`V${ech.modalite || '?'} ${(Number(a.montant)||0).toLocaleString('fr-FR')} FCFA`) : (`${eid} ${(Number(a.montant)||0).toLocaleString('fr-FR')} FCFA`);
                        return <div key={idx} className="text-xs">{label}</div>;
                      })}
                    </div>
                  ) : <span className="text-gray-500">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {echeances && echeances.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Résumé des échéances</h4>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border px-2 py-1">Modalité</th>
                <th className="border px-2 py-1">Date</th>
                <th className="border px-2 py-1">Attendu</th>
                <th className="border px-2 py-1">Payé</th>
                <th className="border px-2 py-1">Reste</th>
              </tr>
            </thead>
            <tbody>
              {echeances.map((e: any) => {
                const id = e.id || `${classe.niveau}-${e.modalite}`;
                const payé = payéParEcheance[id] || 0;
                const attendu = Number(e.montant || 0);
                const resteE = Math.max(0, attendu - payé);
                return (
                  <tr key={id}>
                    <td className="border px-2 py-1">V{e.modalite}</td>
                    <td className="border px-2 py-1">{e.date}</td>
                    <td className="border px-2 py-1 text-right">{attendu.toLocaleString('fr-FR')} FCFA</td>
                    <td className="border px-2 py-1 text-right">{payé.toLocaleString('fr-FR')} FCFA</td>
                    <td className="border px-2 py-1 text-right">{resteE.toLocaleString('fr-FR')} FCFA</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-right font-bold">
        <div>Total payé : {total.toLocaleString('fr-FR')} FCFA</div>
        <div>Total attendu : {totalAttendu.toLocaleString('fr-FR')} FCFA</div>
        <div>Reste à payer : {reste.toLocaleString('fr-FR')} FCFA</div>
      </div>

      <div className="mt-6 text-sm">Opérateur: {operateur || (getCurrentUser() ? `${getCurrentUser()!.prenoms} ${getCurrentUser()!.nom}` : 'Inconnu')}</div>

      <div className="flex flex-col mt-4">
        <div className="mt-auto text-xs text-gray-500 border-t pt-2 text-center">
          <div className="mb-1">Aucun remboursement n'est possible après encaissement.</div>
          <div className="italic">Imprimé le {new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>
    </div>
  );
}

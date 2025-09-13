import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, DollarSign, FileText, AlertTriangle, Printer } from 'lucide-react';
import { db } from '../../utils/database';
import { Eleve, Classe, Paiement, FraisScolaire } from '../../types';
import { useToast } from '../Layout/ToastProvider';
import PaymentForm from './PaymentForm';
import RecuPaiement from './RecuPaiement';
import CombinedRecu from './CombinedRecu';
import Convocation from './Convocation';
import { computeScheduleForEleve } from '../../utils/payments';
import { openPrintPreviewFromElementId } from '../../utils/printPreview';
import { echeancesManager } from '../../utils/echeancesManager';
import { getEnteteConfig } from '../../utils/entetesConfig';
import ElevePaymentPage from './ElevePaymentPage';
import ModuleContainer from '../Layout/ModuleContainer';
import Button from '../UI/Button';

// Types pour clarifier les structures de données
interface SituationFinanciere {
  eleve: Eleve;
  classe: Classe | undefined;
  totalDu: number;
  totalPaye: number;
  solde: number;
  statut: 'Payé' | 'Partiel' | 'Impayé';
  paiementsEleve: Paiement[];
  dernierPaiement: Paiement | null;
  situationEcheances: any;
}

interface FinanceStats {
  totalRecettes: number;
  elevesPayes: number;
  elevesPartiels: number;
  elevesImpayes: number;
  totalSolde: number;
}

// Hooks personnalisés
const useFinancialData = () => {
  const eleves = db.getAll<Eleve>('eleves');
  const paiements = db.getAll<Paiement>('paiements').filter(p => !p.canceled);
  const fraisScolaires = db.getAll<FraisScolaire>('fraisScolaires');
  const classes = db.getAll<Classe>('classes');
  return { eleves, paiements, fraisScolaires, classes };
};

const useAlertesEcheances = () => useMemo(() => echeancesManager.getAlertesEcheances(), []);

const useSituationsFinancieres = (eleves: Eleve[], paiements: Paiement[], classes: Classe[]) => {
  return useMemo(() => {
    return eleves.map(eleve => {
        const situationEcheances = echeancesManager.getSituationEcheances(eleve.id);
      const classe = classes.find(c => c.id === eleve.classeId);
      const paiementsEleve = paiements.filter(p => p.eleveId === eleve.id);

      if (situationEcheances) {
          // If student is protected, only consider inscription (modalite === 1) for display totals
          if (situationEcheances.eleve && situationEcheances.eleve.protege) {
            const ins = (situationEcheances.echeances || []).filter((e: any) => e.modalite === 1);
            const totalDuIns = ins.reduce((sum: number, e: any) => sum + (e.montant || 0), 0);
            const totalPayeIns = ins.reduce((sum: number, e: any) => sum + (e.montantPaye || 0), 0);
            const totalRestantIns = ins.reduce((sum: number, e: any) => sum + (e.montantRestant || 0), 0);
            const statut = calculateStatut({ totalDu: totalDuIns, totalPaye: totalPayeIns, totalRestant: totalRestantIns });
            return {
              eleve,
              classe: situationEcheances.classe,
              totalDu: totalDuIns,
              totalPaye: totalPayeIns,
              solde: totalRestantIns,
              statut,
              paiementsEleve,
              dernierPaiement: getLastPayment(paiementsEleve),
              situationEcheances
            } as SituationFinanciere;
          }

          const statut = calculateStatut(situationEcheances);
          return {
            eleve,
            classe: situationEcheances.classe,
            totalDu: situationEcheances.totalDu,
            totalPaye: situationEcheances.totalPaye,
            solde: situationEcheances.totalRestant,
            statut,
            paiementsEleve,
            dernierPaiement: getLastPayment(paiementsEleve),
            situationEcheances
          } as SituationFinanciere;
      }

      const totalPaye = paiementsEleve.reduce((sum, p) => sum + (p.montant || 0), 0);
      return {
        eleve,
        classe,
        totalDu: 0,
        totalPaye,
        solde: 0,
        statut: 'Payé' as const,
        paiementsEleve,
        dernierPaiement: getLastPayment(paiementsEleve),
        situationEcheances: null
      } as SituationFinanciere;
    });
  }, [eleves, paiements, classes]);
};

// Fonctions utilitaires
const calculateStatut = (s: any): 'Payé' | 'Partiel' | 'Impayé' => {
  if (s.totalRestant <= 0 && s.totalDu > 0) return 'Payé';
  if (s.totalPaye > 0 && s.totalRestant > 0) return 'Partiel';
  return 'Impayé';
};

const getLastPayment = (paiements: Paiement[]): Paiement | null => {
  if (!paiements || paiements.length === 0) return null;
  return paiements.sort((a, b) => 
    new Date(b.datePaiement || b.createdAt).getTime() - 
    new Date(a.datePaiement || a.createdAt).getTime()
  )[0];
};

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';

const getStatutColor = (statut: string) => {
  const map: Record<string, string> = {
    'Payé': 'bg-green-100 text-green-800',
    'Partiel': 'bg-orange-100 text-orange-800',
    'Impayé': 'bg-red-100 text-red-800'
  };
  return map[statut] || 'bg-gray-100 text-gray-800';
};

// Composants
const AlertesEcheances: React.FC<{ alertes: any }> = ({ alertes }) => {
  const [showDetails, setShowDetails] = useState(false);
  if (!alertes) return null;
  if (alertes.echeancesEchues.length === 0 && alertes.echeancesProches.length === 0) return null;
  
  return (
    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-yellow-900">Alertes d'Échéances</h3>
        <button 
          onClick={() => setShowDetails(!showDetails)} 
          className="text-yellow-700 hover:bg-yellow-100 px-3 py-1 rounded-md transition-colors text-sm"
        >
          {showDetails ? 'Masquer' : 'Voir Détails'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {alertes.echeancesEchues.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="font-semibold text-red-900">Échéances Échues</div>
            <div className="text-red-700">{alertes.echeancesEchues.length} élève(s) en retard</div>
          </div>
        )}
        {alertes.echeancesProches.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
            <div className="font-semibold text-orange-900">Échéances Prochaines</div>
            <div className="text-orange-700">{alertes.echeancesProches.length} échéance(s) dans 7 jours</div>
          </div>
        )}
      </div>
      {showDetails && (
        <div className="mt-4 space-y-3">
          {alertes.echeancesEchues.slice(0, 5).map((a: any) => (
            <div key={a.eleve.id} className="text-red-700">
              {a.eleve.prenoms} {a.eleve.nom} - {a.totalDu.toLocaleString('fr-FR')} FCFA
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatsCards: React.FC<{ stats: FinanceStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
      <div className="text-xl font-bold text-gray-900">{formatMontant(stats.totalRecettes)}</div>
      <div className="text-gray-600 text-sm">Total Recettes</div>
    </div>
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
      <div className="text-xl font-bold text-green-600">{stats.elevesPayes}</div>
      <div className="text-gray-600 text-sm">Payés</div>
    </div>
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
      <div className="text-xl font-bold text-orange-600">{stats.elevesPartiels}</div>
      <div className="text-gray-600 text-sm">Partiels</div>
    </div>
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
      <div className="text-xl font-bold text-red-600">{stats.elevesImpayes}</div>
      <div className="text-gray-600 text-sm">Impayés</div>
    </div>
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
      <div className="text-xl font-bold text-gray-900">{formatMontant(stats.totalSolde)}</div>
      <div className="text-gray-600 text-sm">Reste à encaisser</div>
    </div>
  </div>
);

const FilterBar: React.FC<{
  searchTerm: string;
  filterClasse: string;
  filterStatut: string;
  classes: Classe[];
  onSearchChange: (value: string) => void;
  onClasseChange: (value: string) => void;
  onStatutChange: (value: string) => void;
  onPrint: () => void;
  onPrintConvocations?: () => void;
}> = ({ searchTerm, filterClasse, filterStatut, classes, onSearchChange, onClasseChange, onStatutChange, onPrint, onPrintConvocations }) => (
  <div className="bg-white p-4 rounded-md border border-gray-200 mt-4">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input 
          value={searchTerm} 
          onChange={e => onSearchChange(e.target.value)} 
          placeholder="Rechercher un élève..." 
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md" 
        />
      </div>
      <select 
        value={filterClasse} 
        onChange={e => onClasseChange(e.target.value)} 
        className="px-4 py-2 border border-gray-300 rounded-md"
      >
        <option value="">Toutes les classes</option>
        {classes.map((c: Classe) => (
          <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>
        ))}
      </select>
      <select 
        value={filterStatut} 
        onChange={e => onStatutChange(e.target.value)} 
        className="px-4 py-2 border border-gray-300 rounded-md"
      >
        <option value="">Tous les statuts</option>
        <option value="Payé">Payé</option>
        <option value="Partiel">Partiel</option>
        <option value="Impayé">Impayé</option>
      </select>
      <div className="flex items-center space-x-2">
        <Button variant="ghost" onClick={onPrint}>
          <Printer className="h-4 w-4" /> 
          <span>Imprimer Liste</span>
        </Button>
        {typeof onPrintConvocations === 'function' && (
          <Button variant="ghost" onClick={onPrintConvocations}>
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>Convocations</span>
          </Button>
        )}
      </div>
    </div>
  </div>
);

const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ isOpen, onClose, children, maxWidth = '2xl' }) => {
  if (!isOpen) return null;
  
  const maxWidthClasses: Record<string, string> = { 
    sm: 'max-w-sm', 
    md: 'max-w-md', 
    lg: 'max-w-lg', 
    xl: 'max-w-xl', 
    '2xl': 'max-w-2xl', 
    '4xl': 'max-w-4xl' 
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-white rounded-2xl shadow-2xl ${maxWidthClasses[maxWidth]} w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        {children}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-100 rounded-lg">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant principal
export default function FinancesList() {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [modals, setModals] = useState({ 
    paymentForm: false, 
    recu: false, 
    combinedRecu: false, 
    convocation: false, 
    elevePaymentPage: false 
  });
  const [selectedEleve, setSelectedEleve] = useState<Eleve | null>(null);
  const [lastPayment, setLastPayment] = useState<Paiement | null>(null);

  const { eleves, paiements, classes } = useFinancialData();
  const alertesEcheances = useAlertesEcheances();
  const situationsFinancieres = useSituationsFinancieres(eleves, paiements, classes);

  useEffect(() => {
    const onData = () => {};
    window.addEventListener('dataChanged', onData as EventListener);
    return () => window.removeEventListener('dataChanged', onData as EventListener);
  }, []);

  const openModal = useCallback((m: keyof typeof modals) => 
    setModals(prev => ({ ...prev, [m]: true })), []
  );
  
  const closeModal = useCallback((m: keyof typeof modals) => 
    setModals(prev => ({ ...prev, [m]: false })), []
  );

  const filteredSituations = useMemo(() => {
    let filtered = [...situationsFinancieres];
    
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.eleve.nom.toLowerCase().includes(t) || 
        s.eleve.prenoms.toLowerCase().includes(t) || 
        s.eleve.matricule.toLowerCase().includes(t)
      );
    }
    
    if (filterClasse) {
      filtered = filtered.filter(s => s.eleve.classeId === filterClasse);
    }
    
    if (filterStatut) {
      filtered = filtered.filter(s => s.statut === filterStatut);
    }
    
    return filtered.sort((a, b) => a.eleve.nom.localeCompare(b.eleve.nom));
  }, [situationsFinancieres, searchTerm, filterClasse, filterStatut]);

  const stats: FinanceStats = useMemo(() => ({
    totalRecettes: paiements.reduce((sum, p) => sum + (p.montant || 0), 0),
    elevesPayes: situationsFinancieres.filter(s => s.statut === 'Payé').length,
    elevesPartiels: situationsFinancieres.filter(s => s.statut === 'Partiel').length,
    elevesImpayes: situationsFinancieres.filter(s => s.statut === 'Impayé').length,
    totalSolde: situationsFinancieres.reduce((sum, s) => sum + s.solde, 0)
  }), [paiements, situationsFinancieres]);

  const handlePaymentSubmit = useCallback((
    eleveId: string, 
    _montant: number, 
    _type: string, 
    _modalite: number | 'auto', 
    paiement?: Paiement
  ) => {
    closeModal('paymentForm');
    if (paiement) {
      setLastPayment(paiement);
      const el = eleves.find(e => e.id === eleveId);
      if (el) { 
        setSelectedEleve(el); 
        openModal('recu'); 
      }
    }
    showToast('Paiement enregistré avec succès', 'success');
    setTimeout(() => window.dispatchEvent(new CustomEvent('dataChanged')), 800);
  }, [eleves, showToast, closeModal, openModal]);

  const handleOpenPaymentPage = useCallback((eleve: Eleve) => { 
    setSelectedEleve(eleve); 
    openModal('elevePaymentPage'); 
  }, [openModal]);

  const handleClosePaymentPage = useCallback(() => { 
    closeModal('elevePaymentPage'); 
    setSelectedEleve(null); 
    setTimeout(() => window.dispatchEvent(new CustomEvent('dataChanged')), 100); 
  }, [closeModal]);

  const handlePrintRecu = useCallback((eleve: Eleve) => {
    const situation = situationsFinancieres.find(s => s.eleve.id === eleve.id);
    if (!situation || !situation.dernierPaiement) { 
      showToast('Aucun paiement trouvé pour cet élève', 'error'); 
      return; 
    }
    setSelectedEleve(eleve); 
    setLastPayment(situation.dernierPaiement); 
    openModal('recu');
  }, [situationsFinancieres, showToast, openModal]);

  const handlePrintCombinedRecu = useCallback((eleve: Eleve) => {
    const situation = situationsFinancieres.find(s => s.eleve.id === eleve.id);
    if (!situation || situation.paiementsEleve.length === 0) { 
      showToast('Aucun paiement trouvé pour cet élève', 'error'); 
      return; 
    }
    setSelectedEleve(eleve); 
    openModal('combinedRecu');
  }, [situationsFinancieres, showToast, openModal]);

  const handlePrintConvocation = useCallback((eleve: Eleve) => {
    try {
      const schedule = computeScheduleForEleve(eleve.id);
      const echeancesImpayees = schedule.filter(s => s.remaining > 0);
      if (echeancesImpayees.length === 0) { 
        showToast('Aucune échéance impayée pour cet élève', 'info'); 
        return; 
      }
      setSelectedEleve(eleve); 
      openModal('convocation');
    } catch (err) { 
      console.error(err); 
      showToast('Erreur lors de la génération de la convocation', 'error'); 
    }
  }, [showToast, openModal]);

  // Batch generate convocations for all overdue élèves and open print preview 5 per page
  const handleBatchConvocations = useCallback(() => {
    try {
      const convocations = echeancesManager.generateConvocations();
      if (!convocations || convocations.length === 0) {
        showToast('Aucune convocation à générer', 'info');
        return;
      }

      const container = document.getElementById('finances-print-area');
      if (!container) {
        showToast('Zone d\'impression introuvable', 'error');
        return;
      }

      // Build compact HTML blocks for each convocation
  const entete = getEnteteConfig('recu') as any;
  const ecole = (db.getAll('ecole')[0] as any) || {};
  const logo = (ecole && ecole.logo) || (entete && entete.logo) || '';

      const blocks = convocations.map((c: any) => {
        const eleve = c.eleve;
        const classe = c.classe || {};
        const echeances = (c.echeancesEchues || []).map((e: any) => {
          const label = e.modalite === 1 ? 'Inscription' : `Versement ${e.modalite}`;
          return `${label} — ${Number(e.montantRestant||0).toLocaleString('fr-FR')} FCFA — échéance ${new Date(e.date).toLocaleDateString('fr-FR')}`;
        });
        return `
          <div class="convocation" style="margin-bottom:8mm;">
            <div style="font-family: 'Times New Roman', Times, serif; font-size:12px; color:#111827;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  ${logo ? `<img src="${logo}" alt="logo" style="height:48px; width:auto; object-fit:contain;"/>` : `<div style="width:48px;height:48px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:11px;border-radius:6px">Logo</div>`}
                  <div>
                    <div style="font-weight:700; font-size:13px;">${ecole.nom || entete.header || 'École'}</div>
                    <div style="font-size:11px; color:#374151;">Année: ${c.anneeScolaire || ''}</div>
                  </div>
                </div>
                <div style="text-align:right; font-size:11px; color:#374151;">Convocation de paiement<br/>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
              </div>

              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <div>
                  <div style="font-weight:600">Élève</div>
                  <div>${eleve.prenoms} ${eleve.nom}</div>
                  <div style="font-size:11px; color:#6b7280">Matricule: ${eleve.matricule || '-'}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:600">Classe</div>
                  <div>${classe.niveau || '-'} ${classe.section || ''}</div>
                </div>
              </div>

              <div style="margin-bottom:6px; font-weight:600">Montant dû: ${(c.totalDu||0).toLocaleString('fr-FR')} FCFA</div>
              <div style="font-size:11px; color:#374151;">${echeances.length ? '<ul style="margin:0;padding-left:18px;">' + (echeances as any[]).map((it: any) => `<li>${it}</li>`).join('') + '</ul>' : '<div>Aucune échéance impayée.</div>'}</div>
              <div style="margin-top:8px; font-size:12px; color:#111827;">
                <strong>Important :</strong> Nous prions les parents ou responsables de se présenter à l'administration afin de régulariser la situation et effectuer le règlement dans les plus brefs délais. Merci de votre compréhension.
              </div>
            </div>
          </div>
        `;
      }).join('\n');

  container.classList.add('print-four-per-page');
      container.innerHTML = `<div class="convocations-wrapper">${blocks}</div>`;
  openPrintPreviewFromElementId('finances-print-area', 'Convocations');
  setTimeout(() => { container.classList.remove('print-four-per-page'); container.innerHTML = ''; }, 800);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la génération des convocations', 'error');
    }
  }, [showToast]);

  const handlePrint = useCallback(() => 
    openPrintPreviewFromElementId('finances-print-area', 'Situation financière'), []
  );

  if (modals.elevePaymentPage && selectedEleve) {
    return <ElevePaymentPage eleve={selectedEleve} onBack={handleClosePaymentPage} />;
  }

  return (
    <ModuleContainer 
      title="Gestion Financière" 
      subtitle="Suivi des paiements et situations financières" 
      actions={
        <Button 
          variant="primary" 
          onClick={() => openModal('paymentForm')} 
          leftIcon={<Plus className="h-5 w-5" />}
        >
          Paiement Rapide
        </Button>
      }
    >
      <AlertesEcheances alertes={alertesEcheances} />
      <StatsCards stats={stats} />
      <FilterBar 
        searchTerm={searchTerm} 
        filterClasse={filterClasse} 
        filterStatut={filterStatut} 
        classes={classes} 
        onSearchChange={setSearchTerm} 
        onClasseChange={setFilterClasse} 
        onStatutChange={setFilterStatut} 
        onPrint={handlePrint} 
        onPrintConvocations={handleBatchConvocations}
      />

      <div id="finances-print-area" className="hidden print:block bg-white p-4 mb-4 print-compact"></div>

      <div className="bg-white rounded-md border border-gray-200 overflow-hidden mt-4">
        <div className="bg-gray-50 px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Situations Financières</h2>
            <p className="text-gray-600 text-sm lg:text-base">{filteredSituations.length} élève(s) trouvé(s)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-semibold text-gray-900">Élève</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-semibold text-gray-900 hidden sm:table-cell">Classe</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-gray-900">Total Dû</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-gray-900">Total Payé</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-gray-900">Reste</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-center text-xs lg:text-sm font-semibold text-gray-900">Statut</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-center text-xs lg:text-sm font-semibold text-gray-900 hidden lg:table-cell">Dernier Paiement</th>
                <th className="px-2 lg:px-4 py-2 lg:py-3 text-center text-xs lg:text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSituations.map(situation => {
                const isProtege = !!situation.eleve?.protege;
                let displayTotalDu = situation.totalDu;
                let displayTotalPaye = situation.totalPaye;
                let displaySolde = situation.solde;
                let displayStatut = situation.statut;

                if (isProtege && situation.situationEcheances && Array.isArray(situation.situationEcheances.echeances)) {
                  const ins = situation.situationEcheances.echeances.filter((e: any) => e.modalite === 1);
                  const totalDuIns = ins.reduce((sum: number, e: any) => sum + (e.montant || 0), 0);
                  const totalPayeIns = ins.reduce((sum: number, e: any) => sum + ((e.montantPaye) || 0), 0);
                  const totalRestantIns = ins.reduce((sum: number, e: any) => sum + ((e.montantRestant) || 0), 0);
                  displayTotalDu = totalDuIns;
                  displayTotalPaye = totalPayeIns;
                  displaySolde = totalRestantIns;
                  if (displayTotalDu > 0) {
                    displayStatut = displaySolde <= 0 ? 'Payé' : (displayTotalPaye > 0 ? 'Partiel' : 'Impayé');
                  }
                }

                return (
                  <tr key={situation.eleve.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 lg:px-4 py-3 lg:py-4">
                      <div className="flex items-center space-x-3">
                        {situation.eleve.photo && (
                          <img 
                            src={situation.eleve.photo} 
                            alt={`${situation.eleve.prenoms} ${situation.eleve.nom}`} 
                            className="h-8 w-8 lg:h-10 lg:w-10 rounded-full object-cover border-2 border-gray-200" 
                          />
                        )}
                        <div 
                          className="cursor-pointer hover:text-teal-600 transition-colors" 
                          onClick={() => handleOpenPaymentPage(situation.eleve)} 
                          title="Cliquer pour ouvrir la page de paiement"
                        >
                          <div className="text-xs lg:text-sm font-semibold text-gray-900">
                            {situation.eleve.prenoms} {situation.eleve.nom}
                          </div>
                          <div className="text-xs text-gray-500 font-mono hidden sm:block">
                            {situation.eleve.matricule}
                          </div>
                          <div className="text-xs text-gray-500 sm:hidden">
                            {situation.classe ? `${situation.classe.niveau} ${situation.classe.section}` : 'Non assigné'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-xs lg:text-sm text-gray-700 font-medium hidden sm:table-cell">
                      {situation.classe ? `${situation.classe.niveau} ${situation.classe.section}` : 'Non assigné'}
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-xs lg:text-sm text-gray-900 text-right font-bold">
                      {formatMontant(displayTotalDu)}
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-xs lg:text-sm text-green-700 text-right font-bold">
                      {formatMontant(displayTotalPaye)}
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-xs lg:text-sm text-right font-bold">
                      <span className={displaySolde > 0 ? 'text-red-600' : 'text-green-600'}>
                        {formatMontant(displaySolde)}
                      </span>
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-center">
                      <span className={`px-2 lg:px-3 py-1 rounded-full text-xs font-semibold ${getStatutColor(displayStatut)}`}>
                        {displayStatut}
                      </span>
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4 text-center text-xs lg:text-sm text-gray-600 hidden lg:table-cell">
                      {situation.dernierPaiement ? (
                        <div>
                          <div className="font-medium">{formatMontant(situation.dernierPaiement.montant)}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(situation.dernierPaiement.datePaiement || situation.dernierPaiement.createdAt).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Aucun</span>
                      )}
                    </td>
                    <td className="px-2 lg:px-4 py-3 lg:py-4">
                      <div className="flex items-center justify-center space-x-1 lg:space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleOpenPaymentPage(situation.eleve)} 
                          title="Ouvrir page de paiement"
                        >
                          <Plus className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                        {situation.paiementsEleve.length > 0 && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handlePrintRecu(situation.eleve)} 
                              title="Imprimer dernier reçu"
                            >
                              <Printer className="h-3 w-3 lg:h-4 lg:w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handlePrintCombinedRecu(situation.eleve)} 
                              title="Reçu combiné" 
                              className="hidden sm:inline-flex"
                            >
                              <FileText className="h-3 w-3 lg:h-4 lg:w-4" />
                            </Button>
                          </>
                        )}
                        {situation.solde > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handlePrintConvocation(situation.eleve)} 
                            title="Convocation de paiement"
                          >
                            <AlertTriangle className="h-3 w-3 lg:h-4 lg:w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSituations.length === 0 && (
          <div className="text-center py-12">
            <DollarSign className="h-12 w-12 lg:h-16 lg:w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-base lg:text-lg">Aucune situation financière trouvée</p>
            <p className="text-gray-400 text-xs lg:text-sm mt-2">Ajustez vos filtres ou ajoutez des élèves</p>
          </div>
        )}
      </div>

      {modals.paymentForm && (
        <PaymentForm 
          onSubmit={handlePaymentSubmit} 
          onCancel={() => closeModal('paymentForm')} 
        />
      )}

      <Modal isOpen={modals.recu} onClose={() => closeModal('recu')} maxWidth="2xl">
        {selectedEleve && lastPayment && (
          <RecuPaiement 
            eleve={{ 
              nom: selectedEleve.nom, 
              prenoms: selectedEleve.prenoms, 
              matricule: selectedEleve.matricule, 
              classe: classes.find(c => c.id === selectedEleve.classeId)?.niveau + ' ' + classes.find(c => c.id === selectedEleve.classeId)?.section || '' 
            }} 
            montantRegle={lastPayment.montant} 
            date={lastPayment.datePaiement || lastPayment.createdAt} 
            mode={lastPayment.modePaiement || 'Espèces'} 
            cumulReglement={situationsFinancieres.find(s => s.eleve.id === selectedEleve.id)?.totalPaye || 0} 
            resteAPayer={situationsFinancieres.find(s => s.eleve.id === selectedEleve.id)?.solde || 0} 
            anneeScolaire={classes.find(c => c.id === selectedEleve.classeId)?.anneeScolaire || ''} 
            operateur={lastPayment.operateur || 'ADMIN'} 
            numeroRecu={lastPayment.numeroRecu || 'REC' + Date.now().toString().slice(-8)} 
          />
        )}
      </Modal>

      <Modal isOpen={modals.combinedRecu} onClose={() => closeModal('combinedRecu')} maxWidth="4xl">
        {selectedEleve && (
          <CombinedRecu 
            eleve={selectedEleve} 
            paiements={situationsFinancieres.find(s => s.eleve.id === selectedEleve.id)?.paiementsEleve || []} 
            classe={classes.find(c => c.id === selectedEleve.classeId)} 
            anneeScolaire={classes.find(c => c.id === selectedEleve.classeId)?.anneeScolaire} 
          />
        )}
      </Modal>

      <Modal isOpen={modals.convocation} onClose={() => closeModal('convocation')} maxWidth="4xl">
        {selectedEleve && (() => {
          try {
            const schedule = computeScheduleForEleve(selectedEleve.id);
            const echeancesImpayees = schedule.filter(s => s.remaining > 0).map(s => ({ 
              modalite: s.modalite || 1, 
              date: s.dueDate || s.date || '', 
              attendu: s.montant || 0, 
              paye: (s.montant || 0) - (s.remaining || 0), 
              reste: s.remaining || 0 
            }));
            const totalDue = echeancesImpayees.reduce((sum, e) => sum + e.reste, 0);
            return (
              <Convocation 
                eleve={selectedEleve} 
                echeances={echeancesImpayees} 
                totalDue={totalDue} 
                classe={classes.find(c => c.id === selectedEleve.classeId)} 
                anneeScolaire={classes.find(c => c.id === selectedEleve.classeId)?.anneeScolaire} 
              />
            );
          } catch (error) {
            return (
              <div className="p-8 text-center">
                <p className="text-red-600">Erreur lors de la génération de la convocation</p>
              </div>
            );
          }
        })()}
      </Modal>
    </ModuleContainer>
  );
}
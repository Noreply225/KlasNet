// ...existing code...
import { Eleve, Ecole, Utilisateur, HistoriqueAction } from '../types';
import { getAllEnteteConfig, saveEnteteConfig } from './entetesConfig';

class LocalDatabase {
  private static instance: LocalDatabase;
  
  private constructor() {
    this.initializeDefaultData();
  }

  // Historique des actions
  // Historique des actions
  // Accept an action without id/date/createdAt/updatedAt and populate them here.
  addHistorique(action: Omit<HistoriqueAction, 'id' | 'date' | 'createdAt' | 'updatedAt'>) {
    const historiques = this.getAll<HistoriqueAction>('historiques');
    const now = new Date().toISOString();
    const newAction: HistoriqueAction = Object.assign({}, action as Omit<HistoriqueAction, 'id' | 'date' | 'createdAt' | 'updatedAt'>, {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      date: now,
      createdAt: now,
      updatedAt: now,
    }) as HistoriqueAction;
    historiques.push(newAction);
    localStorage.setItem('historiques', JSON.stringify(historiques));
    return newAction;
  }

  static getInstance(): LocalDatabase {
    if (!LocalDatabase.instance) {
      LocalDatabase.instance = new LocalDatabase();
    }
    return LocalDatabase.instance;
  }

  private initializeDefaultData() {
    // Initialiser toutes les collections vides
    const collections = [
      'ecole', 'matieres', 'classes', 'enseignants', 'fraisScolaires',
      'eleves', 'paiements', 'notes', 'moyennesGenerales', 'utilisateurs',
      'compositions', 'historiques'
    ];
    
    collections.forEach(collection => {
      if (!localStorage.getItem(collection)) {
        localStorage.setItem(collection, JSON.stringify([]));
      }
    });

    // Utilisateur admin par défaut
    if (!localStorage.getItem('utilisateurs')) {
      const adminDefaut: Utilisateur = {
        id: '1',
        nom: 'ADMIN',
        prenoms: 'Système',
        nomUtilisateur: 'admin',
        role: 'Admin',
        actif: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('utilisateurs', JSON.stringify([adminDefaut]));
    }

    // École par défaut si pas configurée
    if (!localStorage.getItem('ecole') || JSON.parse(localStorage.getItem('ecole') || '[]').length === 0) {
      const now = new Date().toISOString();
      const ecoleDefaut: Omit<Ecole, 'id' | 'createdAt'> = {
        nom: 'École Primaire Excellence',
        codeEtablissement: 'EPE2025',
        adresse: 'Abidjan, Côte d\'Ivoire',
        telephone: '+225 XX XX XX XX XX',
        email: 'contact@ecole.ci',
        logo: '',
        devise: 'FCFA',
        anneeScolaireActive: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
        compositions: [],
        createdAt: now,
        updatedAt: now,
      } as Omit<Ecole, 'id' | 'createdAt'>;
      this.create('ecole', ecoleDefaut);
    }

    // Migration / sync : si les entêtes d'impression sont encore sur leurs valeurs par défaut,
    // copier le nom et le logo de la table `ecole` pour harmoniser l'affichage imprimé.
    try {
      const allEntetes = getAllEnteteConfig();
      const currentEcole = this.getAll<Ecole>('ecole')?.[0] as any;
      if (currentEcole) {
        const elevesTitle = (allEntetes.eleves && typeof allEntetes.eleves.etablissement === 'string') ? allEntetes.eleves.etablissement : '';
        const recuTitle = (allEntetes.recu && typeof (allEntetes.recu as any).etablissement === 'string') ? (allEntetes.recu as any).etablissement : '';

        const looksDefault = (s: string) => !s || s.toLowerCase().includes('nom de') || s.toLowerCase().includes('établissement');

        let changed = false;
        if (looksDefault(elevesTitle)) {
          allEntetes.eleves.etablissement = currentEcole.nom || allEntetes.eleves.etablissement;
          allEntetes.eleves.logo = currentEcole.logo || allEntetes.eleves.logo;
          changed = true;
        }
        if (looksDefault(recuTitle)) {
          // recu config may not originally have 'etablissement' key; set it safely
          (allEntetes.recu as any).etablissement = currentEcole.nom || (allEntetes.recu as any).etablissement || '';
          (allEntetes.recu as any).logo = currentEcole.logo || (allEntetes.recu as any).logo || '';
          changed = true;
        }

        if (changed) saveEnteteConfig(allEntetes);
      }
    } catch (_e) { /* ignore migration errors */ }
  }

  // Méthodes génériques
  getAll<T>(collection: string): T[] {
    try {
      const data = localStorage.getItem(collection);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Erreur lors du chargement de ${collection}:`, error);
      return [];
    }
  }

  getById<T extends { id: string }>(collection: string, id: string): T | null {
    const items = this.getAll<T>(collection);
    return items.find(item => item.id === id) || null;
  }

  create<T extends { id: string }>(collection: string, item: Omit<T, 'id' | 'createdAt'>) {
    const items = this.getAll<T>(collection);
    const newItem = Object.assign({}, item, {
      id: this.generateId(),
      createdAt: new Date().toISOString()
    }) as unknown as T;
    items.push(newItem);
    localStorage.setItem(collection, JSON.stringify(items));
    return newItem;
  }

  update<T extends { id: string }>(collection: string, id: string, updates: Partial<T>) {
    const items = this.getAll<T>(collection);
    const index = items.findIndex(item => item.id === id);
    
    if (index !== -1) {
      items[index] = { 
        ...items[index], 
        ...updates,
        updatedAt: new Date().toISOString()
      } as T;
      localStorage.setItem(collection, JSON.stringify(items));
      return items[index];
    }
    return null;
  }

  delete(collection: string, id: string): boolean {
    const items = this.getAll<{ id: string }>(collection);
    const filteredItems = items.filter(item => item.id !== id);
    if (filteredItems.length !== items.length) {
      localStorage.setItem(collection, JSON.stringify(filteredItems));
      return true;
    }
    return false;
  }

  private generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  // Méthodes spécifiques pour le matricule auto
  generateMatricule(): string {
    const eleves = this.getAll<Eleve>('eleves');
    const annee = new Date().getFullYear().toString().substr(2, 2);
    const numero = (eleves.length + 1).toString().padStart(4, '0');
    return `${annee}${numero}`;
  }

  // Recherche et filtrage
  search<T>(collection: string, searchTerm: string, fields: (keyof T)[]): T[] {
    const items = this.getAll<T>(collection);
    if (!searchTerm) return items;

    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      fields.some(field => {
        const value = item[field];
        return value && value.toString().toLowerCase().includes(term);
      })
    );
  }

  // Exportation de toutes les données
  exportData(): string {
    const collections = [
      'ecole',
      'matieres',
      'classes',
      'enseignants',
      'eleves',
      'fraisScolaires',
      'paiements',
      'notes',
      'moyennesGenerales',
      'utilisateurs',
      'compositions',
      'historiques'
    ];

  const data: Record<string, unknown> = {};
    collections.forEach(collection => {
      data[collection] = this.getAll(collection);
    });

    return JSON.stringify(data, null, 2);
  }

  // Importation des données
  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      Object.entries(data).forEach(([collection, items]) => {
        localStorage.setItem(collection, JSON.stringify(items));
      });
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'importation des données:', error);
      return false;
    }
  }

  // Réinitialisation des données
  resetData(): void {
    localStorage.clear();
    this.initializeDefaultData();
  }
}

export const db = LocalDatabase.getInstance();
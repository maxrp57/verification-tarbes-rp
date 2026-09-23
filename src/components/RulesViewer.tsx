import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Award,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface Article {
  id: string;
  artNumber: string;
  title: string;
  content: string[];
}

interface TitreSection {
  id: string;
  titreNumber: string;
  titreTitle: string;
  articles: Article[];
}

interface RulesViewerProps {
  rawText: string;
  onAgree?: () => void;
  showAgreeButton?: boolean;
}

export const RulesViewer: React.FC<RulesViewerProps> = ({
  rawText,
  onAgree,
  showAgreeButton = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTitres, setExpandedTitres] = useState<Record<string, boolean>>({});

  // Parse markdown text into structured data
  const { preambule, sections } = useMemo(() => {
    if (!rawText) return { preambule: '', sections: [] as TitreSection[] };

    const lines = rawText.split('\n');
    let inPreambule = false;
    let preambuleLines: string[] = [];
    const parsedSections: TitreSection[] = [];

    let currentTitre: TitreSection | null = null;
    let currentArticle: Article | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip decorative dividers
      if (line.startsWith('# ═══') || line.startsWith('════')) {
        continue;
      }

      if (line.includes('PRÉAMBULE')) {
        inPreambule = true;
        continue;
      }

      // Check if line is a TITRE
      if (line.includes('TITRE ') && (line.startsWith('#') || line.startsWith('TITRE'))) {
        inPreambule = false;
        if (currentArticle && currentTitre) {
          currentTitre.articles.push(currentArticle);
          currentArticle = null;
        }
        if (currentTitre) {
          parsedSections.push(currentTitre);
        }

        const cleanTitre = line.replace(/^[#\s*]+/, '').trim();
        const parts = cleanTitre.split('—');
        const titreNumber = parts[0]?.trim() || cleanTitre;
        const titreTitle = parts[1]?.trim() || '';

        currentTitre = {
          id: `titre-${parsedSections.length + 1}`,
          titreNumber,
          titreTitle,
          articles: [],
        };
        continue;
      }

      // Check if line is an Article
      if ((line.includes('Art.') || line.includes('Article')) && (line.startsWith('#') || line.startsWith('📌'))) {
        inPreambule = false;
        if (currentArticle && currentTitre) {
          currentTitre.articles.push(currentArticle);
        }

        const cleanArt = line.replace(/^[#\s*📌]+/, '').trim();
        const artParts = cleanArt.split('—');
        const artNumber = artParts[0]?.trim() || 'Article';
        const title = artParts[1]?.trim() || '';

        currentArticle = {
          id: `art-${artNumber.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          artNumber,
          title,
          content: [],
        };
        continue;
      }

      if (inPreambule) {
        if (line) preambuleLines.push(line);
      } else if (currentArticle) {
        if (line) currentArticle.content.push(line);
      } else if (currentTitre && line) {
        // Loose text under titre
        currentArticle = {
          id: `art-intro-${currentTitre.id}-${parsedSections.length}`,
          artNumber: 'Introduction',
          title: '',
          content: [line],
        };
      }
    }

    if (currentArticle && currentTitre) {
      currentTitre.articles.push(currentArticle);
    }
    if (currentTitre) {
      parsedSections.push(currentTitre);
    }

    return {
      preambule: preambuleLines.join('\n'),
      sections: parsedSections,
    };
  }, [rawText]);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return sections;
    }

    const q = searchQuery.toLowerCase();
    return sections
      .map((section) => {
        const matchesTitre =
          section.titreNumber.toLowerCase().includes(q) ||
          section.titreTitle.toLowerCase().includes(q);

        const matchingArticles = section.articles.filter((art) => {
          return (
            art.artNumber.toLowerCase().includes(q) ||
            art.title.toLowerCase().includes(q) ||
            art.content.some((c) => c.toLowerCase().includes(q))
          );
        });

        if (matchesTitre) {
          return section;
        }

        if (matchingArticles.length > 0) {
          return {
            ...section,
            articles: matchingArticles,
          };
        }

        return null;
      })
      .filter((s): s is TitreSection => s !== null);
  }, [sections, searchQuery]);

  const toggleTitre = (id: string) => {
    setExpandedTitres((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const formatLine = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        const isSanction = /bannissement|warn|kick|sanction|interdit|tolérance zéro/i.test(inner);
        const isImportant = /obligatoire|impératif|règlement/i.test(inner);

        return (
          <strong
            key={index}
            className={`font-semibold ${
              isSanction
                ? 'text-red-400 bg-red-950/60 px-1 py-0.5 rounded border border-red-800/40'
                : isImportant
                ? 'text-amber-300'
                : 'text-slate-100'
            }`}
          >
            {inner}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4 font-sans">
      {/* Search Bar - Clean & Non-obtrusive */}
      <div className="bg-[#0f131d] p-3.5 rounded-xl border border-slate-800/90 shadow-sm flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Rechercher un article ou un mot-clé (ex: conduite, police, arme, ban, art. 3...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#0a0d14] border border-slate-700/80 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Effacer
            </button>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
          <FileText className="w-3.5 h-3.5 text-red-500" />
          <span>{sections.reduce((acc, s) => acc + s.articles.length, 0)} articles officiels</span>
        </div>
      </div>

      {/* Preambule Notice */}
      {!searchQuery && preambule && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/20 via-[#0e121c] to-[#0e121c] border-l-4 border-red-700 border-y border-r border-slate-800 text-xs leading-relaxed text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-bold text-red-400 text-sm">
            <Shield className="w-4 h-4 text-red-500" />
            <span>PRÉAMBULE OFFICIEL</span>
          </div>
          <p className="whitespace-pre-line text-slate-300 font-sans">{preambule}</p>
        </div>
      )}

      {/* Structured Sections List (Direct clean reading without tabs) */}
      <div className="space-y-3.5">
        {filteredSections.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2 bg-[#0d1017] rounded-xl border border-slate-800">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm font-semibold">Aucun article ne correspond à votre recherche.</p>
            <p className="text-xs text-slate-500">
              Tapez un autre mot-clé ou effacez la recherche pour voir tous les articles.
            </p>
          </div>
        ) : (
          filteredSections.map((section) => {
            const isExpanded = expandedTitres[section.id] !== false; // expanded by default

            return (
              <div
                key={section.id}
                className="bg-[#0f131e] border border-slate-800 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Titre Header with Red/Blue Accent */}
                <button
                  type="button"
                  onClick={() => toggleTitre(section.id)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-[#131726] hover:bg-[#161b2c] transition-colors text-left cursor-pointer border-b border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-red-950/80 text-red-300 border border-red-800/60 shadow-sm">
                      {section.titreNumber}
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      {section.titreTitle}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      {section.articles.length} article(s)
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Articles inside Titre */}
                {isExpanded && (
                  <div className="p-4 space-y-4 divide-y divide-slate-800/60">
                    {section.articles.map((art) => (
                      <div key={art.id} className="pt-3.5 first:pt-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-950/40 text-blue-300 border border-blue-800/40">
                            {art.artNumber}
                          </span>
                          {art.title && (
                            <h4 className="text-xs sm:text-sm font-bold text-slate-200">
                              {art.title}
                            </h4>
                          )}
                        </div>

                        <div className="space-y-1.5 pl-2 sm:pl-3 text-xs sm:text-[13px] text-slate-300 leading-relaxed font-sans">
                          {art.content.map((cLine, idx) => {
                            const isBullet =
                              cLine.startsWith('•') || cLine.startsWith('-') || cLine.startsWith('→');
                            const cleanText = isBullet ? cLine.replace(/^[•\-→]\s*/, '') : cLine;

                            return (
                              <div
                                key={idx}
                                className={`flex items-start gap-2 ${
                                  isBullet ? 'text-slate-300' : 'text-slate-400 font-medium'
                                }`}
                              >
                                {isBullet && (
                                  <span className="text-red-500 mt-1 select-none font-bold">
                                    •
                                  </span>
                                )}
                                <p className="flex-1">{formatLine(cleanText)}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Dispositions Finales Banner */}
      <div className="p-4 rounded-xl bg-[#0e121c] border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-red-500 shrink-0" />
          <span>Règlement certifié conforme • Communauté Officielle Tarbes RP</span>
        </div>
        {showAgreeButton && onAgree && (
          <button
            onClick={onAgree}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-red-700 hover:bg-red-600 shadow-md shadow-red-700/25 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valider la lecture</span>
          </button>
        )}
      </div>
    </div>
  );
};

import React from 'react';

export type Skin = 'modern' | 'classic' | 'dark' | 'minimal' | 'retro';

interface SkinInfo {
    id: Skin;
    name: string;
    description: string;
    previewColors: string[];
}

const SKINS: SkinInfo[] = [
    {
        id: 'modern',
        name: 'Modern',
        description: 'Clean, high-contrast digital look',
        previewColors: ['#e0e0ea', '#1a1a2e', '#cc3333']
    },
    {
        id: 'classic',
        name: 'Vintage',
        description: 'Warm brass and paper aesthetic',
        previewColors: ['#F5F0E1', '#4a3628', '#aa2222']
    },
    {
        id: 'dark',
        name: 'Neon Dark',
        description: 'Glowing cyberpunk style',
        previewColors: ['#0a0a12', '#00ffff', '#ff0055']
    },
    {
        id: 'minimal',
        name: 'Minimalist',
        description: 'Flat, essential design',
        previewColors: ['#ffffff', '#000000', '#000000']
    },
    {
        id: 'retro',
        name: 'Retro Paper',
        description: 'Technical grid and aged paper',
        previewColors: ['#fdf6e3', '#657b83', '#dc322f']
    }
];

interface Props {
    selectedSkin: Skin;
    onSelect: (skin: Skin) => void;
}

const SkinSelector: React.FC<Props> = ({ selectedSkin, onSelect }) => {
    return (
        <div className="w-full max-w-2xl px-4">
            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 snap-x justify-start md:justify-center no-scrollbar">
                {SKINS.map((skin) => (
                    <button
                        key={skin.id}
                        onClick={() => onSelect(skin.id)}
                        className={`
                            group relative shrink-0 snap-center
                            w-32 h-20 rounded-xl overflow-hidden
                            transition-all duration-300 ease-out
                            border-2
                            ${selectedSkin === skin.id
                                ? 'border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                                : 'border-white/10 hover:border-white/40 hover:scale-105 opacity-70 hover:opacity-100'}
                        `}
                    >
                        {/* Preview Background */}
                        <div
                            className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black"
                            style={{
                                background: skin.id === 'modern' ? '#e0e0ea' :
                                    skin.id === 'classic' ? 'linear-gradient(180deg, #F5F0E1, #D4C8A8)' :
                                        skin.id === 'dark' ? '#0a0a12' :
                                            skin.id === 'minimal' ? '#ffffff' :
                                                '#fdf6e3'
                            }}
                        />

                        {/* Decor elements based on skin colors */}
                        <div className="absolute top-2 left-2 right-2 h-1 rounded-full" style={{ background: skin.previewColors[1], opacity: 0.2 }}></div>

                        {/* Needle Indication */}
                        <div
                            className="absolute bottom-[-10px] left-1/2 w-0.5 h-12 origin-bottom transform -rotate-15"
                            style={{ background: skin.previewColors[2] }}
                        ></div>

                        {/* Label Overlay */}
                        <div className="absolute inset-x-0 bottom-0 p-1.5 bg-black/60 backdrop-blur-sm text-center">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${selectedSkin === skin.id ? 'text-white' : 'text-white/80'}`}>
                                {skin.name}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SkinSelector;

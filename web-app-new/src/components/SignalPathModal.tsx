import React from 'react';
import { CheckCircle2, Info, Settings2, Target, Speaker, Zap } from 'lucide-react';

interface SignalNode {
    type: string;
    description: string;
    details?: string;
    status?: string;
}

interface SignalPathModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: SignalNode[];
    quality?: string;
}

const SignalPathModal: React.FC<SignalPathModalProps> = ({ isOpen, onClose, nodes, quality }) => {
    if (!isOpen) return null;

    const getNodeIcon = (type: string, description: string) => {
        if (description.includes('CamillaDSP')) return <Zap className="text-accent-primary" size={18} />;
        if (description.includes('BlackHole')) return <Settings2 className="text-themed-muted" size={18} />;
        if (description.includes('D50 III')) return <Target className="text-accent-primary" size={18} />;

        switch (type) {
            case 'source': return <Info className="text-themed-muted" size={18} />;
            case 'output': return <Speaker className="text-themed-muted" size={18} />;
            case 'dsp': return <Settings2 className="text-accent-primary" size={18} />;
            default: return <CheckCircle2 className="text-themed-muted" size={18} />;
        }
    };

    const getQualityColor = (quality?: string) => {
        switch (quality) {
            case 'lossless': return 'bg-[#9b59b6]';
            case 'high_quality': return 'bg-[#2ecc71]';
            default: return 'bg-[#f1c40f]';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative bg-[#000000] border border-themed-medium rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-themed-subtle flex items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${getQualityColor(quality)} shadow-[0_0_10px_currentColor]`} />
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-themed-primary">Signal Path</span>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-8 flex flex-col items-center custom-scrollbar max-h-[70vh] overflow-y-auto">
                    {nodes.map((node, index) => (
                        <React.Fragment key={index}>
                            <div className="w-full flex items-start gap-4 group">
                                <div className="mt-1 p-2 bg-themed-deep rounded-xl border border-themed-medium group-hover:border-accent-primary/30 transition-colors">
                                    {getNodeIcon(node.type, node.description)}
                                </div>
                                <div className="flex-1 flex flex-col min-w-0">
                                    <h4 className="text-sm font-bold text-themed-primary leading-tight">{node.description}</h4>
                                    {node.details && (
                                        <p className="text-[11px] text-themed-muted mt-0.5 font-medium leading-relaxed">{node.details}</p>
                                    )}
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-[9px] uppercase tracking-widest font-black text-accent-primary/60">{node.type}</span>
                                        {node.status === 'enhanced' && (
                                            <span className="text-[8px] bg-accent-primary/10 text-accent-primary px-1.5 py-0.5 rounded-full font-black">DSP ACTIVE</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {index < nodes.length - 1 && (
                                <div className="py-3 flex justify-center w-full">
                                    <div className="w-px h-6 bg-themed-medium border-l border-dashed border-themed-subtle" />
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-themed-deep/50 border-t border-themed-subtle text-center">
                    <span className="text-[9px] text-themed-muted font-bold uppercase tracking-widest">End-to-End Resolution Preserved</span>
                </div>
            </div>
        </div>
    );
};

export default SignalPathModal;

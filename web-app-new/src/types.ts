export interface FilterParam {
    id: string;
    type: 'Peaking' | 'Highshelf' | 'Lowshelf' | 'Lowpass' | 'Highpass';
    freq: number;
    gain: number;
    q: number;
    enabled: boolean;
}

export interface Preset {
    name?: string; // filename
    preamp: number;
    filters: FilterParam[];
}

export interface DSPStatus {
    running: boolean;
}

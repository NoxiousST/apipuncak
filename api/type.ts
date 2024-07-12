export interface PaymentIntent {
    created: number;
    amount: number
    email: string;
    name: string;
    note: string;
    display: string
}

export interface Payments {
    count: number;
    total: number;
    intents: PaymentIntent[];
}

export interface TingkatAktivitas {
    status: string;
    description: string;
    count: number;
    mounts: Mount[];
}

interface Mount {
    name: string;
    location: string;
    link: string;
    status: string;
    latitude: number;
    longitude: number;
    code: string;
    laporan: Laporan
}

export interface LaporanAktivitas {
    level: string,
    name: string,
    date?: string,
    time?: string,
    author?: string,
    geo?: string,
    code?: string,
    laporan: Laporan
    latitude?: number,
    longitude?: number
}

interface Laporan {
    image: string,
    visual: string,
    klimatologi?: string,
    gempa?: string[],
    rekomendasi?: string[]
}

export interface LaporanLetusan {
    image: string,
    title: string,
    date: string,
    author: string,
    description: string,
    rekomendasi: string[],
    latitude?: number,
    longitude?: number,
}

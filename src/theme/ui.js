export const COLORS = {
    primary: '#2563eb',
    success: '#16a34a',
    danger: '#dc2626',
    bg: '#f8fafc',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    subtext: '#64748b',
    muted: '#94a3b8',
    primarySoft: '#eff6ff',
    successSoft: '#f0fdf4',
    dangerSoft: '#fef2f2',
};

export const RADIUS = {
    xs: 8,
    sm: 10,
    md: 12,
    lg: 16,
};

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
};

export const TYPO = {
    screenTitle: { fontSize: 26, fontWeight: '700' },
    cardTitle: { fontSize: 18, fontWeight: '700' },
    body: { fontSize: 14, fontWeight: '400' },
    bodyMedium: { fontSize: 14, fontWeight: '600' },
    helper: { fontSize: 12, fontWeight: '400' },
    tiny: { fontSize: 11, fontWeight: '400' },
    tinyMedium: { fontSize: 11, fontWeight: '600' },
};

export const UI = {
    screen: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    scroll: {
        padding: 20,
        paddingBottom: 48,
    },
    card: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 14,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    backText: {
        color: COLORS.primary,
        fontSize: 17,
        fontWeight: '600',
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.subtext,
    },
    deviceBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 14,
    },
    primaryBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryBtn: {
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: '#334155',
        fontSize: 14,
        fontWeight: '600',
    },
    dangerBtn: {
        backgroundColor: COLORS.danger,
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    progressCard: {
        backgroundColor: COLORS.primarySoft,
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        marginBottom: 14,
    },
    doneCard: {
        backgroundColor: COLORS.successSoft,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#bbf7d0',
    },
    logBox: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
};
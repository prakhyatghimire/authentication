export const systemListRows = (userId) => [
    { userId, name: 'Watchlist', isSystem: true, systemType: 'watchlist' },
    { userId, name: 'Liked Movies', isSystem: true, systemType: 'liked' },
    { userId, name: 'Watched', isSystem: true, systemType: 'watched' }
];

export const ensureSystemLists = (prismaClient, userId) => prismaClient.list.createMany({
    data: systemListRows(userId),
    skipDuplicates: true
});

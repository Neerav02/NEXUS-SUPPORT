"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    // Create admin agent account
    const passwordHash = await bcryptjs_1.default.hash('changeme123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@nexus.support' },
        update: {},
        create: {
            email: 'admin@nexus.support',
            passwordHash,
            role: 'admin',
            displayName: 'Admin Agent',
        },
    });
    console.log(`✅ Admin agent created: ${admin.email} (role: ${admin.role})`);
    // Create a regular agent account for testing
    const agentHash = await bcryptjs_1.default.hash('agent123', 12);
    const agent = await prisma.user.upsert({
        where: { email: 'agent@nexus.support' },
        update: {},
        create: {
            email: 'agent@nexus.support',
            passwordHash: agentHash,
            role: 'agent',
            displayName: 'Support Agent',
        },
    });
    console.log(`✅ Agent created: ${agent.email} (role: ${agent.role})`);
    console.log('🌱 Seeding complete!');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map
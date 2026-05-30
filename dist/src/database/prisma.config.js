import "dotenv/config";
import { defineConfig } from "prisma/config";
import env from 'dotenv';
env.config();
export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        url: process.env.DATABASE_URL,
    },
});

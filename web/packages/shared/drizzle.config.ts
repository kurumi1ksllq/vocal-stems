// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // 迁移在应用启动时由主进程执行（见 apps/desktop/src/main/db.ts），
  // 这里只负责生成 SQL。
  dbCredentials: {
    url: './data/app.db',
  },
})

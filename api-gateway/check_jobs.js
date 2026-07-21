const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    include: {
      jobLogs: true
    }
  });

  console.log("ALL DOCUMENTS IN DB:");
  for (const doc of docs) {
    console.log(`\nDocument: ${doc.name} (${doc.id})`);
    console.log(`Status: ${doc.status}`);
    console.log(`Job Logs:`);
    for (const job of doc.jobLogs) {
      console.log(`  - Type: ${job.jobType} | Status: ${job.status} | Error: ${job.error}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

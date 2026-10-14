import { prisma } from '../lib/db/prisma';
import { getStorageProvider } from '../lib/storage';
import { createSessionToken, SESSION_COOKIE_NAME } from '../lib/auth/session';
async function main() {
  const evidence = "Sample Engineer built a React dashboard and Python API for a task management application.";
  const stream = `BT /F1 12 Tf 50 700 Td (${evidence}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

 const storage=getStorageProvider();

 const form=new FormData();
 form.set('file',new Blob([new Uint8Array(Buffer.from(pdf))],{type:'application/pdf'}),'upload-parser-check.pdf');
 form.set('isActive','false');
 const response=await fetch('http://localhost:3000/api/resumes',{method:'POST',headers:{cookie:SESSION_COOKIE_NAME+'='+createSessionToken('user_a')},body:form});
 const result=await response.json();
 console.log(JSON.stringify({status:response.status,success:result.success,error:result.error,textLength:result.resume?.extractedText?.length,containsReact:result.resume?.extractedText?.includes('React')}));
 if(result.success) {
  await prisma.resume.delete({where:{id:result.resume.id}});
  await storage.deleteFile(result.resume.filePath);
 }
 await prisma.$disconnect();
 if(!result.success) process.exitCode=1;
} main().catch(e=>{console.error(e);process.exitCode=1;});



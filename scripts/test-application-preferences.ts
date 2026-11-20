import { prisma } from '../lib/db/prisma';
import { generateApplicationEmail } from '../lib/ai/gemini';
import { GeminiExtraction } from '@/lib/validation/schemas';

async function testApplicationPreferences() {
  console.log('Running application preferences test...');
  const userId = 'test-user-prefs';

  // Clean up previous test runs
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});

  try {
    // 1. Create a test user
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: 'Test User',
        email: 'test.user.prefs@example.com',
      },
    });
    console.log('Created test user:', user.id);

    // 2. Update application preferences
    const preferences = {
      noticePeriod: '15 Days',
      expectedCTC: 25.5,
      currentCTC: 20,
      availabilityDate: new Date('2026-11-25').toISOString(),
      relocationPreferences: JSON.stringify(['Hyderabad', 'Bangalore']),
    };

    await prisma.user.update({
      where: { id: user.id },
      data: preferences,
    });
    console.log('Updated user preferences.');

    // 3. Verify preferences are saved
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    console.log('Fetched updated user:', updatedUser);

    if (
      updatedUser?.noticePeriod !== preferences.noticePeriod ||
      updatedUser?.expectedCTC !== preferences.expectedCTC ||
      updatedUser?.currentCTC !== preferences.currentCTC ||
      new Date(updatedUser?.availabilityDate!).getTime() !== new Date(preferences.availabilityDate).getTime() ||
      updatedUser?.relocationPreferences !== preferences.relocationPreferences
    ) {
      console.error('FAILED: Preferences were not saved correctly.');
      console.log('Expected:', preferences);
      console.log('Got:', {
          noticePeriod: updatedUser?.noticePeriod,
          expectedCTC: updatedUser?.expectedCTC,
          currentCTC: updatedUser?.currentCTC,
          availabilityDate: updatedUser?.availabilityDate,
          relocationPreferences: updatedUser?.relocationPreferences,
      });
      return;
    }
    console.log('PASSED: Preferences saved correctly.');

    // 4. Test email generation
    const jobDetails: GeminiExtraction = {
      category: 'JOB_POST',
      companyName: 'Test Corp',
      jobTitle: 'Software Engineer',
      recipientEmail: 'hiring@testcorp.com',
      jobDescription: 'We are looking for a great engineer. Please mention your notice period, expected ctc and availability.',
      linkedInUrls: [],
      applicationUrls: [],
      otherUrls: [],
      requiredSkills: [],
      experienceRequirements: null,
      location: null,
      workMode: null,
      contactName: null,
      contactRole: null,
      evidenceText: null,
      confidence: 'HIGH',
      manualReviewReason: null,
    };

    const email = await generateApplicationEmail({
      jobDetails,
      resumeText: `
John Doe
Software Engineer
Experience:
- Senior Software Engineer at Tech Corp (2020-Present)
  - Developed and maintained web applications using React and Node.js.
  - Worked on a team of 5 engineers to deliver high-quality software.
- Software Engineer at Acme Inc (2018-2020)
  - Built and deployed microservices using Go and Docker.
Education:
- B.S. in Computer Science from University of Example
`,
      senderName: updatedUser!.name,
      senderEmail: updatedUser!.email!,
      applicationPreferences: {
        noticePeriod: updatedUser!.noticePeriod,
        expectedCTC: updatedUser!.expectedCTC,
        currentCTC: updatedUser!.currentCTC,
        availabilityDate: updatedUser!.availabilityDate,
        relocationPreferences: updatedUser!.relocationPreferences,
      },
    });
    
    const emailBody = email.body;
    console.log('Generated email body:', emailBody);

    const missingPreferences = [];
    if (!emailBody.toLowerCase().includes(preferences.noticePeriod.toLowerCase())) {
      missingPreferences.push('notice period');
    }
    if (!emailBody.includes(preferences.expectedCTC.toString())) {
      missingPreferences.push('expected CTC');
    }
    if (!emailBody.includes(new Date(preferences.availabilityDate).toLocaleDateString())) {
        missingPreferences.push('availability');
    }


    if (missingPreferences.length > 0) {
      console.error(`FAILED: Email body did not include: ${missingPreferences.join(', ')}`);
      return;
    }
    console.log('PASSED: Email generation included requested preferences.');
  } finally {
    // 5. Clean up
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log('Cleaned up test user.');
  }
}

testApplicationPreferences().catch(console.error);

export interface PregnancyTest {
  id: string;
  name: string;
  weekFrom: number;
  weekTo: number;
  description: string;
}

export const PREGNANCY_TESTS: PregnancyTest[] = [
  {
    id: 'blood_initial',
    name: 'בדיקות דם ראשוניות',
    weekFrom: 8,
    weekTo: 10,
    description: 'ספירת דם, סוג דם, נוגדנים, אדמת, הפטיטיס, HIV ועוד',
  },
  {
    id: 'nt_scan',
    name: 'שקיפות עורפית',
    weekFrom: 11,
    weekTo: 14,
    description: 'אולטרסאונד למדידת נוזל בעורף העובר לאיתור תסמונת דאון ועוד',
  },
  {
    id: 'blood_screen1',
    name: 'סקר ראשון – בדיקות דם',
    weekFrom: 11,
    weekTo: 14,
    description: 'בדיקת דם הורמונלית המשולבת עם השקיפות העורפית',
  },
  {
    id: 'early_anatomy',
    name: 'סקירת מערכות מוקדמת',
    weekFrom: 14,
    weekTo: 16,
    description: 'אולטרסאונד לבדיקת איברי העובר בשלב מוקדם',
  },
  {
    id: 'blood_screen2',
    name: 'סקר שני – בדיקות דם',
    weekFrom: 15,
    weekTo: 20,
    description: 'בדיקת דם לאיתור פגמים בצינור העצבי ותסמונות נוספות',
  },
  {
    id: 'late_anatomy',
    name: 'סקירת מערכות מאוחרת',
    weekFrom: 18,
    weekTo: 22,
    description: 'אולטרסאונד מפורט לבדיקת כל מערכות גוף העובר – הבדיקה החשובה ביותר',
  },
  {
    id: 'glucose',
    name: 'העמסת סוכר (GCT)',
    weekFrom: 24,
    weekTo: 28,
    description: 'בדיקת סוכרת הריון – שתיית תמיסת סוכר ובדיקת דם שעה אחר כך',
  },
  {
    id: 'gbs',
    name: 'בדיקת GBS (סטרפטוקוק)',
    weekFrom: 35,
    weekTo: 37,
    description: 'תרבית מהנרתיק לאיתור חיידק שעלול לפגוע בתינוק בלידה',
  },
  {
    id: 'blood_prelabor',
    name: 'בדיקות דם לקראת לידה',
    weekFrom: 35,
    weekTo: 38,
    description: 'ספירת דם, קרישה ועוד – לקראת הלידה',
  },
];

export function getUpcomingTests(currentWeek: number): PregnancyTest[] {
  return PREGNANCY_TESTS.filter(
    (t) => currentWeek >= t.weekFrom - 1 && currentWeek <= t.weekTo,
  );
}

export function getTestById(id: string): PregnancyTest | undefined {
  return PREGNANCY_TESTS.find((t) => t.id === id);
}
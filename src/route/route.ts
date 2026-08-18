import { Router } from "express";
import authRoute from "./authRoute.js";
import userAccountRoute from "./userAccountRoute.js";
import employeeRoute from "./employeeRoute.js";
import departmentRoute from "./departmentRoute.js";
import positionRoute from "./positionRoute.js";
import featureRoute from "./featureRoute.js";
import holidayRoute from "./holidayRoute.js";
import leaveTypeRoute from "./leaveTypeRoute.js";
import leaveRequestRoute from "./leaveRequestRoute.js";
import leaveBalanceRoute from "./leaveBalanceRoute.js";

/**
 * Perakit seluruh rute aplikasi. Setiap modul memegang satu domain dan
 * mendaftarkan jalurnya sendiri secara lengkap, sehingga menambah domain baru
 * cukup dengan membuat satu berkas rute lalu mendaftarkannya di sini.
 *
 * Urutan pemasangan mengikuti alur pemakaian: autentikasi lebih dulu, lalu
 * data organisasi, kemudian modul cuti.
 */
const router = Router();

router.use(authRoute);
router.use(userAccountRoute);

router.use(employeeRoute);
router.use(departmentRoute);
router.use(positionRoute);
router.use(featureRoute);

router.use(holidayRoute);
router.use(leaveTypeRoute);
router.use(leaveRequestRoute);
router.use(leaveBalanceRoute);

export default router;

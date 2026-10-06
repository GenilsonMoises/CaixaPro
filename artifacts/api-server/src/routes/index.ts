import { Router, type IRouter } from "express";
import financeRouter from "./finance";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(financeRouter);

export default router;

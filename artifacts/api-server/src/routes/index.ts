import { Router, type IRouter } from "express";
import { requireFinanceAuth } from "../middlewares/requireFinanceAuth";
import financeRouter from "./finance";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireFinanceAuth, financeRouter);

export default router;

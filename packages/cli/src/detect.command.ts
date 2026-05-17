import { FsPathProbe, detectPath } from '@claude-fw/core';

export type DetectCommandArgs = {
  readonly path: string;
};

export type DetectCommandReport = {
  readonly path: string;
  readonly isFramework: boolean;
  readonly isProject: boolean;
};

export const runDetect = async (args: DetectCommandArgs): Promise<DetectCommandReport> => {
  const probe = new FsPathProbe();
  const result = await detectPath({ path: args.path, probe });
  return { path: args.path, isFramework: result.isFramework, isProject: result.isProject };
};

export const formatDetectReport = (report: DetectCommandReport): string => {
  return [
    `Path: ${report.path}`,
    `Framework root: ${report.isFramework ? 'yes' : 'no'}`,
    `Project root:   ${report.isProject ? 'yes' : 'no'}`,
  ].join('\n');
};

export const formatDetectReportJson = (report: DetectCommandReport): string => {
  return JSON.stringify(report, null, 2);
};

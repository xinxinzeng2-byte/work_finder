import type {PortfolioContact} from '../types';

export const contactKindLabels:Record<PortfolioContact['kind'],string>={
  email:'邮箱',
  phone:'电话',
  website:'个人网站',
  github:'GitHub',
  linkedin:'LinkedIn',
  wechat:'微信',
  custom:'自定义',
};

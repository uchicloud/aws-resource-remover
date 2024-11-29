import type { Resource } from "@aws-sdk/client-resource-explorer-2";

export type ResourceDict = {
    emptyTag: Resource[], // Nameタグのみのリソース
    remove: Resource[], // yyyyMM形式のタグが含まれているリソース
    over: Resource[], // yyyyMM形式のタグが含まれており、かつそのタグが現在の月よりも前のリソース
    error: Resource[], // 存在しない日付タグがついたリソース
};

export const messageDict: {[K: string]: string;} = {
    'resourcetype:ec2:instance': 'EC2インスタンス',
    'resourcetype:ec2:instance_en': 'EC2 Instance',
    'resourcetype:rds:db': 'RDSインスタンス',
    'resourcetype:rds:db_en': 'RDS Instance',
    'resourcetype:rds:cluster': 'RDSクラスター',
    'resourcetype:rds:cluster_en': 'RDS Cluster',
};

export const ignoreTags: string[] = [
    "Name", "CreatedBy", "CreatedDate"
];

export const messageDict: {[K: string]: string;} = {
    'resourcetype:ec2:instance': 'EC2インスタンス',
    'resourcetype:ec2:instance_en': 'EC2 Instance',
    'resourcetype:rds:db-instance': 'RDSインスタンス',
    'resourcetype:rds:db-instance_en': 'RDS Instance',
};

export const ignoreTags: string[] = [
    "Name", "CreatedBy", "CreatedDate"
];
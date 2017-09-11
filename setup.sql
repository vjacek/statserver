# mysql podcounter < setup.sql

drop table if exists downloads;
create table downloads (
    time timestamp,
    ip varchar(100),
    file varchar(1000),
    agent varchar(1000),
    index index_file_time (file, time)
) ENGINE=InnoDB;
